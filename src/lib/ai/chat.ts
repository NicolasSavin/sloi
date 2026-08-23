import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchDigest } from "@/lib/market/fetch";
import { SYMBOLS } from "@/lib/market/symbols";
import { newsAlertText } from "@/lib/calendar";

const Input = z.object({
  question: z.string().min(2).max(500),
  symbol: z.string().optional(),
});

function guessSymbol(q: string, hint?: string) {
  const hay = `${hint ?? ""} ${q}`.toUpperCase();
  const hit = SYMBOLS.find(
    (s) =>
      hay.includes(s.id) ||
      hay.includes(s.label.toUpperCase()) ||
      (s.id === "XAUUSD" && /ЗОЛОТ|GOLD|XAU/.test(hay)) ||
      (s.id === "XAGUSD" && /СЕРЕБР|SILVER|XAG/.test(hay)) ||
      (s.id === "USOIL" && /НЕФТ|OIL|WTI|BRENT/.test(hay)),
  );
  return hit?.id ?? hint ?? "EURUSD";
}

function localReply(question: string, symbol: string, pack: Awaited<ReturnType<typeof fetchDigest>>) {
  const digest = pack.digest;
  const m = digest.markets.find((x) => x.spec.id === symbol) ?? digest.markets[0];
  const halt = digest.fund.halt;
  const news = halt ? newsAlertText(halt) : digest.fund.line;
  if (!m) return `Стол сейчас без снимка. Вопрос: ${question}`;
  return [
    `${m.spec.label} (${m.spec.id}). Цена ${m.lastClose}. Смещение ${m.changePct.toFixed(2)}%.`,
    `Слой: ${m.bias}. Совет: ${m.advice.title}.`,
    m.advice.because,
    m.advice.therefore,
    m.story?.doing ? `Крупняк: ${m.story.doing}` : "",
    news,
    "Это ответ движка стола. Не приказ и не обещание прибыли.",
  ]
    .filter(Boolean)
    .join(" ");
}

function asGroq(raw?: string) {
  if (!raw) return undefined;
  if (raw.startsWith("xai-") || raw.startsWith("AIza")) return undefined;
  return raw;
}

async function llm(prompt: string): Promise<{ text: string; model: string } | null> {
  const groq = asGroq(process.env.GROQ_API_KEY) || asGroq(process.env.GROK_API_KEY);
  const gemini = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const tries: { label: string; url: string; key: string; model: string }[] = [];
  if (groq) {
    tries.push({
      label: "Llama",
      url: "https://api.groq.com/openai/v1/chat/completions",
      key: groq,
      model: "llama-3.1-8b-instant",
    });
  }
  if (gemini) {
    tries.push({
      label: "Gemini",
      url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      key: gemini,
      model: "gemini-2.0-flash",
    });
  }
  for (const t of tries) {
    try {
      const res = await fetch(t.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t.key}` },
        body: JSON.stringify({
          model: t.model,
          messages: [
            {
              role: "system",
              content:
                "Ты дежурный стола SLOI. По-русски, коротко, без канцелярита. Опирайся только на данные стола. Не обещай прибыль. Не выдумывай уровни, которых нет во входе.",
            },
            { role: "user", content: prompt },
          ],
        }),
      });
      if (!res.ok) continue;
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = json.choices?.[0]?.message?.content?.trim();
      if (text) return { text, model: t.label };
    } catch {
      /* next */
    }
  }
  return null;
}

export const askDeskChat = createServerFn({ method: "POST" })
  .validator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const pack = await fetchDigest();
    const symbol = guessSymbol(data.question, data.symbol);
    const fallback = localReply(data.question, symbol, pack);
    const m = pack.digest.markets.find((x) => x.spec.id === symbol);
    const halt = pack.digest.fund.halt;
    const prompt = `Вопрос трейдера: ${data.question}
Пара: ${symbol} ${m?.spec.label ?? ""}
Цена: ${m?.lastClose ?? "н/д"} смещение ${m?.changePct ?? 0}%
Слой: ${m?.bias ?? ""} совет: ${m?.advice.title ?? ""}
Почему: ${m?.advice.because ?? ""}
Следствие: ${m?.advice.therefore ?? ""}
Крупняк: ${m?.story?.doing ?? ""} / ждёт: ${m?.story?.waiting ?? ""}
Новости: ${halt ? newsAlertText(halt) : pack.digest.fund.line}
Ответь 4–8 предложениями.`;
    const ai = await llm(prompt);
    return {
      ok: true as const,
      symbol,
      model: ai?.model ?? "стол",
      text: ai?.text ?? fallback,
    };
  });

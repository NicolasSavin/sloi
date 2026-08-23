import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchDigest, fetchMarket } from "@/lib/market/fetch";
import { SYMBOLS, getSymbol } from "@/lib/market/symbols";
import { newsAlertText } from "@/lib/calendar";
import { analyzeMarket } from "@/lib/smc/engine";
import { formatPrice } from "@/lib/utils";

const Input = z.object({
  question: z.string().min(2).max(500),
  symbol: z.string().optional(),
});

const ALIAS: [RegExp, string][] = [
  [/золот|gold|xau/i, "XAUUSD"],
  [/серебр|silver|xag/i, "XAGUSD"],
  [/нефть|oil|wti|brent/i, "USOIL"],
  [/евро.?иен|eurjpy/i, "EURJPY"],
  [/фунт.?иен|gbpjpy/i, "GBPJPY"],
  [/евро.?фунт|eurgbp/i, "EURGBP"],
  [/евро|euro|eurusd|eur\/usd/i, "EURUSD"],
  [/фунт|кабел|sterling|gbpusd|gbp\/usd/i, "GBPUSD"],
  [/иен|yen|usdjpy|usd\/jpy/i, "USDJPY"],
  [/франк|franc|usdchf/i, "USDCHF"],
  [/австрал|аусси|aussie|audusd/i, "AUDUSD"],
  [/канад|луни|loonie|usdcad/i, "USDCAD"],
  [/киви|новозел|nzdusd/i, "NZDUSD"],
  [/nasdaq|наздак|qqq/i, "QQQ"],
  [/s&p|сп500|spy/i, "SPY"],
];

function guessSymbol(q: string, hint?: string) {
  const text = q.trim();
  for (const [re, id] of ALIAS) if (re.test(text)) return id;
  const hay = text.toUpperCase().replace(/\s+/g, "");
  const byId = SYMBOLS.find((s) => hay.includes(s.id) || hay.includes(s.label.toUpperCase().replace(/\s+/g, "")));
  return byId?.id ?? hint ?? "EURUSD";
}

function replyFromSnap(q: string, symbol: string, pack: Awaited<ReturnType<typeof fetchDigest>>, snap: ReturnType<typeof analyzeMarket> | null) {
  const spec = getSymbol(symbol);
  const m = pack.digest.markets.find((x) => x.spec.id === symbol);
  const halt = pack.digest.fund.halt;
  const px = snap ? formatPrice(snap.lastClose, spec.decimals) : m ? formatPrice(m.lastClose, spec.decimals) : "н/д";
  const harm = snap?.patterns.filter((p) => p.family === "harmonic") ?? [];
  const graf = snap?.patterns.filter((p) => p.family === "graphic") ?? [];
  const pats = snap?.patterns ?? [];

  if (/гармон/i.test(q)) {
    if (!harm.length) {
      return `${spec.label} ${px}. На часовике чистой гармоники (Gartley, Bat, Cypher, ABCD) нет. ${graf[0] ? `Из графических ближе ${graf[0].name}: ${graf[0].therefore}` : "Свинги не сложились в гармонический сетап."}`;
    }
    return `${spec.label} ${px}. Гармоника: ${harm.map((p) => `${p.name} — ${p.therefore}`).join(" ")}`;
  }
  if (/паттерн|фигур|вымпел|флаг|плеч|двойн/i.test(q)) {
    if (!pats.length) return `${spec.label} ${px}. Чистой фигуры нет: ни флага, ни вымпела, ни головы-плеч.`;
    return `${spec.label} ${px}. Фигуры: ${pats.map((p) => `${p.name} (${p.family === "harmonic" ? "гармоника" : "графика"}) — ${p.therefore}`).join(" ")}`;
  }
  if (/вайкоф|wyckoff|фаз/i.test(q)) {
    const w = snap?.wyckoff;
    return w ? `${spec.label} ${px}. Вайкофф: ${w.name}. ${w.therefore}` : `${spec.label}: фазу Вайкоффа стол сейчас не видит.`;
  }
  if (/новост|календар|nfp|cpi|запрещ/i.test(q)) {
    return halt ? newsAlertText(halt) : pack.digest.fund.line;
  }
  if (/вход|сигнал|лонг|шорт|можно ли/i.test(q) && m) {
    return `${spec.label} ${px}. ${m.advice.title}. ${m.advice.because} ${m.advice.therefore}`;
  }

  const bits = [
    `${spec.label} ${px}, слой ${snap?.bias ?? m?.bias ?? "—"}.`,
    m?.advice.title,
    harm[0] ? `Гармоника: ${harm[0].name}.` : "Гармоники нет.",
    snap?.wyckoff ? `Вайкофф: ${snap.wyckoff.name}.` : "",
    m?.story.doing,
  ].filter(Boolean);
  return bits.join(" ");
}

function asGroq(raw?: string) {
  if (!raw) return undefined;
  if (raw.startsWith("xai-") || raw.startsWith("AIza")) return undefined;
  return raw;
}

async function llm(prompt: string): Promise<{ text: string; model: string } | null> {
  const groq = asGroq(process.env.GROQ_API_KEY) || asGroq(process.env.GROK_API_KEY);
  if (!groq) return null;
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${groq}` },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: "Дежурный SLOI. Отвечай строго на вопрос. Не повторяй весь снимок. Без обещания прибыли." },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = json.choices?.[0]?.message?.content?.trim();
    return text ? { text, model: "Llama" } : null;
  } catch {
    return null;
  }
}

export const askDeskChat = createServerFn({ method: "POST" })
  .validator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const pack = await fetchDigest();
    const symbol = guessSymbol(data.question, data.symbol);
    let snap: ReturnType<typeof analyzeMarket> | null = null;
    try {
      const market = await fetchMarket({ data: { symbol, timeframe: "1h" } });
      if (market.candles?.length) snap = analyzeMarket(market.candles, market.options, market.trades);
    } catch {
      snap = null;
    }
    const fallback = replyFromSnap(data.question, symbol, pack, snap);
    const harm = snap?.patterns.filter((p) => p.family === "harmonic").map((p) => p.name) ?? [];
    const prompt = `Вопрос: ${data.question}
Пара ${symbol}. Паттерны: ${snap?.patterns.map((p) => p.name).join(", ") || "нет"}. Гармоника: ${harm.join(", ") || "нет"}.
Вайкофф: ${snap?.wyckoff.name ?? "нет"}. Совет: ${pack.digest.markets.find((x) => x.spec.id === symbol)?.advice.title ?? ""}.
Ответь только на вопрос, 3–6 предложений.`;
    const ai = await llm(prompt);
    return { ok: true as const, symbol, model: ai?.model ?? "стол", text: ai?.text ?? fallback };
  });

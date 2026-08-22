import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { MarketStory, StoryBeat } from "@/lib/smc/engine";

const Input = z.object({
  payload: z.unknown(),
});

export interface AiBrief {
  bias: "bullish" | "bearish" | "range";
  confidence: number;
  headline: string;
  now: string;
  chain: StoryBeat[];
  means: string;
  ifHolds: string;
  ifBreaks: string;
  doing: string;
  waiting: string;
  leadsTo: string;
  setup: {
    type: string;
    entry: string;
    stop: string;
    targets: string[];
    invalidation: string;
  };
  risks: string[];
  watch: string[];
}

type CacheEntry = { at: number; brief: AiBrief; model: string };
const cache = new Map<string, CacheEntry>();
const TTL = 5 * 60 * 1000;
let windowStart = Date.now();
let windowCount = 0;
const WINDOW_MS = 10 * 60 * 1000;
const WINDOW_MAX = 8;
const SCHEMA = "v4";

function cacheKey(payload: unknown): string {
  const p = payload as {
    symbol?: string;
    timeframe?: string;
    lastClose?: number;
    events?: { time?: number }[];
  };
  const lastEv = p.events?.at(-1)?.time ?? 0;
  return `${SCHEMA}|${p.symbol}|${p.timeframe}|${Math.round(Number(p.lastClose) || 0)}|${lastEv}`;
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced?.[1] ?? text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no json");
  return JSON.parse(raw.slice(start, end + 1));
}

function asBeats(raw: unknown): StoryBeat[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const b = item as Record<string, unknown>;
      const because = String(b.because ?? "").trim();
      const therefore = String(b.therefore ?? "").trim();
      if (!because || !therefore) return null;
      return { because, therefore };
    })
    .filter((b): b is StoryBeat => b != null)
    .slice(0, 5);
}

function asBrief(data: unknown): AiBrief | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const bias = d.bias;
  if (bias !== "bullish" && bias !== "bearish" && bias !== "range") return null;
  const setup = (d.setup ?? {}) as Record<string, unknown>;
  const chain = asBeats(d.chain);
  const now = String(d.now ?? d.narrative ?? "").trim();
  if (!now && chain.length === 0) return null;
  return {
    bias,
    confidence: Math.max(0, Math.min(100, Number(d.confidence) || 0)),
    headline: String(d.headline ?? "Что происходит"),
    now,
    chain,
    means: String(d.means ?? "").trim(),
    ifHolds: String(d.ifHolds ?? "").trim(),
    ifBreaks: String(d.ifBreaks ?? setup.invalidation ?? "").trim(),
    doing: String(d.doing ?? d.now ?? "").trim(),
    waiting: String(d.waiting ?? "").trim(),
    leadsTo: String(d.leadsTo ?? d.means ?? "").trim(),
    setup: {
      type: String(setup.type ?? "наблюдение"),
      entry: String(setup.entry ?? "—"),
      stop: String(setup.stop ?? "—"),
      targets: Array.isArray(setup.targets)
        ? setup.targets.map((t) => String(t)).slice(0, 4)
        : [],
      invalidation: String(setup.invalidation ?? "—"),
    },
    risks: Array.isArray(d.risks) ? d.risks.map((t) => String(t)).slice(0, 4) : [],
    watch: Array.isArray(d.watch) ? d.watch.map((t) => String(t)).slice(0, 4) : [],
  };
}

export function briefToStory(brief: AiBrief): MarketStory {
  return {
    now: brief.now,
    chain: brief.chain,
    means: brief.means,
    ifHolds: brief.ifHolds,
    ifBreaks: brief.ifBreaks,
    doing: brief.doing || brief.now,
    waiting: brief.waiting,
    leadsTo: brief.leadsTo || brief.means,
  };
}

interface ChatProvider {
  id: string;
  label: string;
  key?: string;
  url: string;
  model: string;
  models?: string[];
}

function providers(): ChatProvider[] {
  return [
    {
      id: "grok",
      label: "Grok",
      key: process.env.XAI_API_KEY,
      url: "https://api.x.ai/v1/chat/completions",
      model: "grok-4.6",
      models: ["grok-4.6", "grok-4.5", "grok-4-0709", "grok-4", "grok-3"],
    },
    {
      id: "groq",
      label: "Llama 3.3",
      key: process.env.GROQ_API_KEY,
      url: "https://api.groq.com/openai/v1/chat/completions",
      model: "llama-3.3-70b-versatile",
    },
    {
      id: "gemini",
      label: "Gemini",
      key: process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      model: "gemini-2.0-flash",
    },
    {
      id: "openai",
      label: "GPT-4o mini",
      key: process.env.OPENAI_API_KEY,
      url: "https://api.openai.com/v1/chat/completions",
      model: "gpt-4o-mini",
    },
    {
      id: "openrouter",
      label: "OpenRouter",
      key: process.env.OPENROUTER_API_KEY,
      url: "https://openrouter.ai/api/v1/chat/completions",
      model: process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct",
    },
  ].filter((p) => Boolean(p.key));
}

const SYSTEM =
  "Ты рассказываешь, что делает крупный игрок (smart money). Одна история, по-русски, без канцелярита. Термин сразу расшифруй. Не обещай прибыль. Не выдумывай уровни. Отвечай ТОЛЬКО JSON.";

function userPrompt(payload: unknown) {
  return `Одна история: что делает крупняк, чего ждёт, к чему это приведёт. Учти сентимент, если он есть во входных данных.
JSON:
{
  "bias": "bullish" | "bearish" | "range",
  "confidence": 0-100,
  "headline": "что делает крупный игрок, 6-12 слов",
  "now": "2 предложения снимка",
  "doing": "что крупняк уже сделал и где он набирает или раздаёт",
  "waiting": "чего он ждёт, какой уровень, почему не входит с рынка",
  "leadsTo": "к чему это приведёт если зона жива, и где история ломается",
  "chain": [
    {"because": "факт", "therefore": "следствие"}
  ],
  "means": "рабочий сценарий одной фразой",
  "ifHolds": "если жив — куда",
  "ifBreaks": "если ломается — что",
  "setup": {
    "type": "string",
    "entry": "зона и зачем",
    "stop": "где тезис мёртв",
    "targets": ["цель и почему"],
    "invalidation": "какое закрытие отменяет"
  },
  "risks": ["риск → следствие"],
  "watch": ["что смотреть"]
}
Данные:
${JSON.stringify(payload)}`;
}

async function chatOnce(p: ChatProvider, payload: unknown): Promise<AiBrief> {
  const models = p.models?.length ? p.models : [p.model];
  let last = `${p.label} нет ответа`;
  for (const model of models) {
    const res = await fetch(p.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${p.key}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.25,
        max_tokens: 1400,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userPrompt(payload) },
        ],
      }),
    });
    if (!res.ok) {
      last = `${p.label} ${res.status}${res.status === 400 ? " (модель)" : ""}`;
      if (res.status === 400 || res.status === 404) continue;
      throw new Error(`${p.label} ${res.status}`);
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = json.choices?.[0]?.message?.content ?? "";
    const brief = asBrief(extractJson(text));
    if (!brief) throw new Error(`${p.label}: не JSON`);
    return brief;
  }
  throw new Error(last);
}

export const analyzeWithGrok = createServerFn({ method: "POST" })
  .validator((input: unknown) => Input.parse(input))
  .handler(
    async ({
      data,
    }): Promise<
      | { ok: true; brief: AiBrief; cached: boolean; model: string }
      | { ok: false; error: string }
    > => {
      const chain = providers();
      if (chain.length === 0) {
        return {
          ok: false,
          error:
            "Нет ключа модели. Движок SMC уже дал разбор. Чтобы подключить нейросеть: Vercel → Environment Variables → GROQ_API_KEY (бесплатно groq.com) или GEMINI_API_KEY или XAI_API_KEY.",
        };
      }

      const key = cacheKey(data.payload);
      const hit = cache.get(key);
      if (hit && Date.now() - hit.at < TTL) {
        return { ok: true, brief: hit.brief, cached: true, model: hit.model };
      }

      const now = Date.now();
      if (now - windowStart > WINDOW_MS) {
        windowStart = now;
        windowCount = 0;
      }
      if (windowCount >= WINDOW_MAX) {
        if (hit) return { ok: true, brief: hit.brief, cached: true, model: hit.model };
        return {
          ok: false,
          error: "Лимит автоанализа. Нажмите ещё раз через несколько минут.",
        };
      }

      windowCount += 1;
      const errors: string[] = [];
      for (const p of chain) {
        try {
          const brief = await chatOnce(p, data.payload);
          const model = p.label;
          cache.set(key, { at: Date.now(), brief, model });
          return { ok: true, brief, cached: false, model };
        } catch (err) {
          errors.push(err instanceof Error ? err.message : p.label);
        }
      }
      return { ok: false, error: `Модели не ответили: ${errors.join("; ")}` };
    },
  );

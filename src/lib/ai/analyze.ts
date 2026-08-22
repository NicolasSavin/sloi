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

type CacheEntry = { at: number; brief: AiBrief };
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

export const analyzeWithGrok = createServerFn({ method: "POST" })
  .validator((input: unknown) => Input.parse(input))
  .handler(
    async ({
      data,
    }): Promise<
      | { ok: true; brief: AiBrief; cached: boolean }
      | { ok: false; error: string }
    > => {
      const apiKey = process.env.XAI_API_KEY;
      if (!apiKey) return { ok: false, error: "Нейросеть недоступна в этой среде." };

      const key = cacheKey(data.payload);
      const hit = cache.get(key);
      if (hit && Date.now() - hit.at < TTL) {
        return { ok: true, brief: hit.brief, cached: true };
      }

      const now = Date.now();
      if (now - windowStart > WINDOW_MS) {
        windowStart = now;
        windowCount = 0;
      }
      if (windowCount >= WINDOW_MAX) {
        if (hit) return { ok: true, brief: hit.brief, cached: true };
        return {
          ok: false,
          error: "Лимит автоанализа. Нажмите ещё раз через несколько минут.",
        };
      }

      const body = JSON.stringify({
        model: "grok-4.5",
        temperature: 0.25,
        max_tokens: 1400,
        messages: [
          {
            role: "system",
            content:
              "Ты рассказываешь, что делает крупный игрок (smart money). Одна история, по-русски, без канцелярита. Термин сразу расшифруй. Не обещай прибыль. Не выдумывай уровни. Отвечай ТОЛЬКО JSON.",
          },
          {
            role: "user",
            content: `Одна история: что делает крупняк, чего ждёт, к чему это приведёт. Учти сентимент, если он есть во входных данных.
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
${JSON.stringify(data.payload)}`,
          },
        ],
      });

      windowCount += 1;
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body,
      });
      if (!res.ok) {
        return { ok: false, error: `xAI API error ${res.status}` };
      }
      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = json.choices?.[0]?.message?.content ?? "";
      try {
        const brief = asBrief(extractJson(text));
        if (!brief) return { ok: false, error: "Не удалось разобрать ответ модели." };
        cache.set(key, { at: Date.now(), brief });
        return { ok: true, brief, cached: false };
      } catch {
        return { ok: false, error: "Модель вернула неструктурированный ответ." };
      }
    },
  );

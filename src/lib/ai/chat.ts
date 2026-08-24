import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchDigest, fetchMarket } from "@/lib/market/fetch";
import { SYMBOLS, getSymbol } from "@/lib/market/symbols";
import { newsAlertText } from "@/lib/calendar";
import { analyzeMarket } from "@/lib/smc/engine";
import { formatPrice } from "@/lib/utils";
import { askPlain } from "@/lib/ai/plain";

const Input = z.object({
  question: z.string().min(2).max(500),
  symbol: z.string().optional(),
});

const ALIAS: [RegExp, string][] = [
  [/золот|gold|xau/i, "XAUUSD"],
  [/серебр|silver|xag/i, "XAGUSD"],
  [/нефть|oil|wti|brent|xti|xbr/i, "XTIUSD"],
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
  const story = snap?.story ?? m?.story;
  const doing = story?.doing ?? "Крупный игрок не показывает чистый набор.";
  const means = story?.means ?? "Пока нет причины открывать сделку «потому что цена живая».";
  const wait = story?.waiting ?? "Ждёт край диапазона или слом структуры.";
  const wy = snap?.wyckoff;
  if (/гармон/i.test(q)) {
    if (!harm.length) {
      return [
        `По ${spec.label} на ${px} гармонического сетапа нет: точки XABCD не сложились в Gartley, Bat, Cypher или классический AB=CD.`,
        graf[0] ? `Ближе обычная графика — ${graf[0].name}: ${graf[0].therefore}` : "Свинги слишком рваные, чтобы натянуть гармонику.",
        doing,
        means,
        "Искать вход по гармонике сейчас бессмысленно — сначала нужна законченная фигура, потом реакция на точку D.",
      ].join(" ");
    }
    return [`По ${spec.label} на ${px} стол видит гармонику ${harm.map((p) => p.name).join(", ")}.`, harm.map((p) => p.therefore).join(" "), doing, "Гармоника — это карта, не приказ."].join(" ");
  }
  if (/паттерн|фигур|вымпел|флаг|плеч|двойн/i.test(q)) {
    if (!pats.length) return `По ${spec.label} на ${px} нет чистой фигуры. ${doing} ${means}`;
    return [`По ${spec.label} на ${px} есть ${pats.map((p) => p.name).join(", ")}.`, pats.map((p) => p.therefore).join(" "), doing, means].join(" ");
  }
  if (/вайкоф|wyckoff|фаз/i.test(q)) {
    return wy ? `По ${spec.label} на ${px} фаза Вайкоффа: ${wy.name}. ${wy.therefore} ${doing} ${wait}` : `По ${spec.label} фазу Вайкоффа стол не разметил. ${doing}`;
  }
  if (/новост|календар|nfp|cpi|запрещ/i.test(q)) {
    return `${halt ? newsAlertText(halt) : pack.digest.fund.line} Для ${spec.label} это фон, не сигнал.`;
  }
  if (/вход|сигнал|лонг|шорт|можно ли/i.test(q) && m) {
    return [`По ${spec.label} на ${px} совет: ${m.advice.title}.`, m.advice.because, m.advice.therefore, doing, wait].join(" ");
  }
  return [`Сейчас по ${spec.label} цена ${px}, слой ${snap?.bias ?? m?.bias ?? "неясен"}.`, doing, means, wait].filter(Boolean).join(" ");
}

const SYSTEM_CHAT =
  "Ты дежурный аналитик стола SLOI. Отвечай по-русски живым языком, 6–12 предложений. Сначала прямой ответ на вопрос. Потом: что делает крупный игрок, зачем, чего ждёт. Не копируй шаблон. Не обещай прибыль. Не выдумывай уровни.";

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
    const st = snap?.story;
    const prompt = `Вопрос: ${data.question}
Пара ${symbol}. Паттерны: ${snap?.patterns.map((p) => `${p.name}: ${p.therefore}`).join(" | ") || "нет"}.
Гармоника: ${harm.join(", ") || "нет"}. Вайкофф: ${snap?.wyckoff ? `${snap.wyckoff.name}. ${snap.wyckoff.therefore}` : "нет"}.
Крупняк делает: ${st?.doing ?? ""}. Значит: ${st?.means ?? ""}. Ждёт: ${st?.waiting ?? ""}.
Совет: ${pack.digest.markets.find((x) => x.spec.id === symbol)?.advice.title ?? ""}.`;
    const ai = await askPlain(SYSTEM_CHAT, prompt);
    if ("text" in ai) return { ok: true as const, symbol, model: ai.model, text: ai.text };
    return { ok: true as const, symbol, model: "стол", text: `${ai.miss} ${fallback}` };
  });

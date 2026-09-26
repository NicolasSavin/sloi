import { createFileRoute } from "@tanstack/react-router";
import { askVision } from "@/lib/ai/plain";
import { ownLevels } from "@/lib/market/fetch";
import { parsePlan } from "@/lib/sketch";
import { SYMBOLS } from "@/lib/market/symbols";
import { addSketch, eraseSketch, listSketches } from "@/lib/sketch-store";

const CHART_EYE = `Ты смотришь скриншот рыночного графика. Пиши по-русски и только то, что видно на картинке.
Назови инструмент и таймфрейм, если они подписаны.
Перечисли фигуры, стрелки, зоны, имбаланс, дивер, подписи и куда они смотрят.
Скажи, что из этого следует для цены: сначала куда, потом куда.
Не выдумывай цены и фигуры, которых на графике нет. Пять-восемь предложений.
Если на графике подписаны вход, стоп и тейк, последней строкой добавь ровно так, числа только с картинки:
ПРИКАЗ EURUSD BUY ENTRY 1.0850 STOP 1.0820 TP 1.0910
BUY — если тейк выше входа. SELL — если тейк ниже входа. Тикер латиницей, как на графике. Если одной из трёх цен нет, строку ПРИКАЗ не пиши и числа не выдумывай. Подпись вроде «тейк у ликвидности» сама по себе ещё не цена.`;

const NAMES: [RegExp, string][] = [
  [/серебр/i, "XAGUSD"],
  [/золот/i, "XAUUSD"],
  [/брент/i, "XBRUSD"],
  [/wti|нефть/i, "XTIUSD"],
  [/газ/i, "XNGUSD"],
  [/биткои?н|bitcoin/i, "BTCUSD"],
  [/эфир|ethereum/i, "ETHUSD"],
  [/евро\s*доллар|евродоллар/i, "EURUSD"],
  [/фунт/i, "GBPUSD"],
  [/йен/i, "USDJPY"],
  [/австрал/i, "AUDUSD"],
  [/канад/i, "USDCAD"],
  [/франк/i, "USDCHF"],
  [/новозеланд/i, "NZDUSD"],
];

function guessSymbol(instrument: string, text: string) {
  const blob = `${instrument} ${text}`.toUpperCase();
  for (const spec of SYMBOLS) if (blob.includes(spec.id)) return spec.id;
  const raw = `${instrument} ${text}`;
  for (const [re, id] of NAMES) if (re.test(raw)) return id;
  return "";
}

async function withDeskLevels(text: string, instrument: string) {
  if (parsePlan(text)) return text;
  const symbol = guessSymbol(instrument, text);
  if (!symbol) return `${text}\nИнструмент не назван, поэтому стол сам уровни не ставит.`;
  const levels = await ownLevels(symbol);
  if (!levels) {
    return `${text}\nНа картинке не было входа, стопа и тейка. Стол тоже не нашёл зону, где есть все три, и приказ не собрал.`;
  }
  const side = levels.side === "buy" ? "BUY" : "SELL";
  return `${text}\nНа картинке не было готовых цен. Стол поставил их сам: вход у своей зоны, стоп за экстремумом, тейк у ближайшей ликвидности.\nПРИКАЗ ${symbol} ${side} ENTRY ${levels.entry} STOP ${levels.stop} TP ${levels.target} СТОЛ`;
}

async function notesFromChart(typed: string, image: string, instrument: string) {
  const hint = instrument
    ? `Если инструмент не подписан, считай его так: ${instrument}. Опиши, что нарисовано и написано на графике.`
    : "Опиши, что нарисовано и написано на графике.";
  const seen = await askVision(CHART_EYE, hint, image);
  if ("text" in seen) {
    const body = typed.length >= 8 ? `${typed}\n${seen.text}` : seen.text;
    return withDeskLevels(body, instrument);
  }
  if (typed.length >= 8) return withDeskLevels(typed, instrument);
  throw new Error(seen.miss);
}

export const Route = createFileRoute("/api/sketches")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const notes = await listSketches();
          return Response.json({ notes });
        } catch {
          return Response.json({ notes: [], error: "db" }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        let body: { instrument?: string; notes?: string; image?: string };
        try {
          body = (await request.json()) as { instrument?: string; notes?: string; image?: string };
        } catch {
          return Response.json({ error: "bad-json" }, { status: 400 });
        }
        try {
          const typed = String(body.notes ?? "").trim();
          const image = String(body.image ?? "");
          const instrument = String(body.instrument ?? "");
          const notes = await notesFromChart(typed, image, instrument);
          const saved = await addSketch({ instrument, notes, image });
          return Response.json(saved);
        } catch (err) {
          const code = err instanceof Error ? err.message : "save";
          return Response.json({ error: code }, { status: 400 });
        }
      },
      DELETE: async ({ request }) => {
        let body: { id?: string; token?: string };
        try {
          body = (await request.json()) as { id?: string; token?: string };
        } catch {
          return Response.json({ error: "bad-json" }, { status: 400 });
        }
        const ok = await eraseSketch(String(body.id ?? ""), String(body.token ?? ""));
        return Response.json({ ok }, { status: ok ? 200 : 403 });
      },
    },
  },
});

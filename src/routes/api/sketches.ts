import { createFileRoute } from "@tanstack/react-router";
import { askVision } from "@/lib/ai/plain";
import { ownLevels } from "@/lib/market/fetch";
import { parsePlan, guessSymbol } from "@/lib/sketch";
import { addSketch, eraseSketch, listSketches } from "@/lib/sketch-store";

const CHART_EYE = `Ты смотришь скриншот рыночного графика. Пиши по-русски и только то, что видно на картинке.
Назови инструмент и таймфрейм, если они подписаны.
Перечисли фигуры, стрелки, зоны, имбаланс, дивер, подписи и куда они смотрят.
Скажи, что из этого следует для цены: сначала куда, потом куда.
Не выдумывай цены и фигуры, которых на графике нет. Пять-восемь предложений.
Если на графике подписаны вход, стоп и тейк, последней строкой добавь ровно так, числа только с картинки:
ПРИКАЗ EURUSD BUY ENTRY 1.0850 STOP 1.0820 TP 1.0910
BUY — если тейк выше входа. SELL — если тейк ниже входа. Тикер латиницей, как на графике. Если одной из трёх цен нет, строку ПРИКАЗ не пиши и числа не выдумывай.
Если нарисован клин, флаг, вымпел или наклонная, скажи, пробита ли линия и в какую сторону.
Если подписано «Тейк» без цифры, посмотри, на какую цену правой шкалы указывает подпись, и последними строками добавь только то, что реально видно:
ПРОБОЙ SELL
ТЕЙК 0.99049
ПРОБОЙ BUY — если пробой вверх. Цифру тейка бери со шкалы, не из головы. Если шкалу не прочитать, строку ТЕЙК не пиши.`;

function chartHint(text: string) {
  const side = /ПРОБОЙ\s+SELL|пробой[^\n]{0,40}вниз|клин[^\n]{0,40}вниз/i.test(text)
    ? ("sell" as const)
    : /ПРОБОЙ\s+BUY|пробой[^\n]{0,40}вверх/i.test(text)
      ? ("buy" as const)
      : undefined;
  const mark = text.match(/ТЕЙК\s+([0-9]+(?:[.,][0-9]+)?)/i);
  const target = mark ? Number(mark[1]!.replace(",", ".")) : null;
  return { side, target: target != null && Number.isFinite(target) ? target : null };
}

async function withDeskLevels(text: string, instrument: string) {
  if (parsePlan(text)) return text;
  const symbol = guessSymbol(instrument, text);
  if (!symbol) return `${text}\nИнструмент не назван, поэтому стол сам уровни не ставит.`;
  const hint = chartHint(text);
  const levels = await ownLevels(symbol, hint);
  if (!levels) {
    return `${text}\nНа картинке не было входа, стопа и тейка. Стол тоже не нашёл пробой наклонной или зону, и приказ не собрал.`;
  }
  const side = levels.side === "buy" ? "BUY" : "SELL";
  const how = /клин|наклон|флаг|вымпел|пробой|голова|плеч|двойн|треугольник|gartley|bat|butterfly|crab|abcd|вульф|паттерн/i.test(text)
    ? "Это фигура или пробой наклонной: вход за шеей или линией, стоп за край фигуры, тейк на её высоту. Если «Тейк» без цифры, цена берётся со шкалы."
    : "На картинке не было готовых цен. Стол поставил их сам: вход у своей зоны, стоп за экстремумом, тейк у ближайшей ликвидности.";
  return `${text}\n${how}\nПРИКАЗ ${symbol} ${side} ENTRY ${levels.entry} STOP ${levels.stop} TP ${levels.target} СТОЛ`;
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
      GET: async ({ request }) => {
        const fill = new URL(request.url).searchParams.get("fill");
        if (fill) {
          const levels = await ownLevels(fill.toUpperCase(), chartHint(new URL(request.url).searchParams.get("text") ?? ""));
          if (!levels) return Response.json({ plan: null });
          return Response.json({
            plan: {
              symbol: fill.toUpperCase(),
              side: levels.side,
              entry: levels.entry,
              stop: levels.stop,
              target: levels.target,
              own: true,
            },
          });
        }
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

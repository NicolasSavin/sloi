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
Если подпись «Вход», «Стоп» или «Тейк» без цифры внутри, прочитай цену по правой шкале, куда она указывает, и добавь только видимые строки:
ВХОД 0.99300
СТОП 0.99600
ТЕЙК 0.99049
ПРОБОЙ SELL
ПРОБОЙ BUY — если пробой вверх.
Если на графике написано «сразу» или «по рынку», добавь КАК NOW. Если написано «лимит» или «отложка», добавь КАК LIMIT. Если такого слова нет, строку КАК не пиши.`;

function chartHint(text: string) {
  const num = (re: RegExp) => {
    const m = text.match(re);
    if (!m?.[1]) return null;
    const n = Number(m[1].replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const side = /ПРОБОЙ\s+SELL|пробой[^\n]{0,40}вниз|клин[^\n]{0,40}вниз/i.test(text)
    ? ("sell" as const)
    : /ПРОБОЙ\s+BUY|пробой[^\n]{0,40}вверх/i.test(text)
      ? ("buy" as const)
      : undefined;
  const how = /КАК\s+NOW/i.test(text) ? ("now" as const) : /КАК\s+LIMIT/i.test(text) ? ("limit" as const) : null;
  return {
    side,
    entry: num(/ВХОД\s+([0-9]+(?:[.,][0-9]+)?)/i),
    stop: num(/СТОП\s+([0-9]+(?:[.,][0-9]+)?)/i),
    target: num(/ТЕЙК\s+([0-9]+(?:[.,][0-9]+)?)/i),
    how,
  };
}

function howWord(how: "now" | "limit" | null) {
  if (how === "now") return " КАК NOW";
  if (how === "limit") return " КАК LIMIT";
  return "";
}

async function withDeskLevels(text: string, instrument: string) {
  const marks = chartHint(text);
  const drawn = parsePlan(text);
  if (drawn) {
    if (marks.how && !/ПРИКАЗ[^\n]*КАК\s+(?:NOW|LIMIT)/i.test(text)) {
      return text.replace(/ПРИКАЗ[^\n]*/, (line) => `${line}${howWord(marks.how)}`);
    }
    return text;
  }
  const symbol = guessSymbol(instrument, text);
  if (!symbol) return `${text}\nИнструмент не назван, поэтому стол сам уровни не ставит.`;
  const levels = await ownLevels(symbol, { side: marks.side, target: marks.target });
  if (!levels && (marks.entry == null || marks.stop == null || marks.target == null)) {
    return `${text}\nС графика не прочитались вход, стоп и тейк, и стол тоже не собрал приказ.`;
  }
  const entry = marks.entry ?? levels?.entry ?? null;
  const stop = marks.stop ?? levels?.stop ?? null;
  const target = marks.target ?? levels?.target ?? null;
  const side = marks.side ?? levels?.side;
  if (entry == null || stop == null || target == null || !side) {
    return `${text}\nНа графике не хватило цен, стол не стал додумывать сторону.`;
  }
  const buyOk = side === "buy" && stop < entry && entry < target;
  const sellOk = side === "sell" && target < entry && entry < stop;
  if (!buyOk && !sellOk) {
    return `${text}\nЦены с графика не сходятся: тейк или стоп не с той стороны входа. Приказ не собрал.`;
  }
  const fromChart = marks.entry != null || marks.stop != null || marks.target != null;
  const verb = side === "buy" ? "BUY" : "SELL";
  const how = fromChart
    ? "Цены взяты с графика, со шкалы, куда смотрят подписи. Стол дописал только то, чего на картинке не было."
    : /клин|наклон|флаг|вымпел|пробой|голова|плеч|двойн|треугольник|паттерн/i.test(text)
      ? "На графике не было цен. Вход на линии пробоя, стоп за край фигуры, тейк на её высоту."
      : "На графике не было цен. Стол поставил вход, стоп и тейк сам.";
  const own = fromChart ? "" : " СТОЛ";
  return `${text}\n${how}\nПРИКАЗ ${symbol} ${verb} ENTRY ${entry} STOP ${stop} TP ${target}${own}${howWord(marks.how)}`;
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
          const text = new URL(request.url).searchParams.get("text") ?? "";
          const marks = chartHint(text);
          const levels = await ownLevels(fill.toUpperCase(), { side: marks.side, target: marks.target });
          const entry = marks.entry ?? levels?.entry ?? null;
          const stop = marks.stop ?? levels?.stop ?? null;
          const target = marks.target ?? levels?.target ?? null;
          const side = marks.side ?? levels?.side;
          if (entry == null || stop == null || target == null || !side) return Response.json({ plan: null });
          const plan = {
            symbol: fill.toUpperCase(),
            side,
            entry,
            stop,
            target,
            own: marks.entry == null && marks.stop == null && marks.target == null,
            how: marks.how,
          };
          const ok = side === "buy" ? stop < entry && entry < target : target < entry && entry < stop;
          if (!ok) return Response.json({ plan: null });
          return Response.json({ plan });
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

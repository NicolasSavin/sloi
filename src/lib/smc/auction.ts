import type { Candle, MarketKind } from "@/lib/market/types";

export interface AuctionSnap {
  ib: { high: number; low: number; mid: number; session: string } | null;
  orb: "inside" | "broke-high" | "broke-low" | "failed-high" | "failed-low";
  week: { high: number; low: number; where: "upper" | "mid" | "lower" };
  vol: "compressed" | "normal" | "expanded";
  atrRatio: number;
  because: string;
  therefore: string;
}

function utcHours(t: number) {
  const d = new Date(t * 1000);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), day: d.getUTCDate(), h: d.getUTCHours() };
}

function ibWindow(kind: MarketKind | undefined) {
  if (kind === "metal" || kind === "index" || kind === "energy") return { start: 13, hours: 1, name: "NY IB" };
  return { start: 7, hours: 1, name: "London IB" };
}

function trueRanges(candles: Candle[]) {
  const out: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i]!;
    const p = candles[i - 1]!;
    out.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }
  return out;
}

export function buildAuction(candles: Candle[], kind?: MarketKind): AuctionSnap {
  const last = candles.at(-1)!;
  const win = ibWindow(kind);
  const { y, m, day } = utcHours(last.time);
  const start = Math.floor(Date.UTC(y, m, day, win.start, 0, 0) / 1000);
  const end = start + win.hours * 3600;
  const ibBars = candles.filter((c) => c.time >= start && c.time < end);
  const ib = ibBars.length
    ? {
        high: Math.max(...ibBars.map((c) => c.high)),
        low: Math.min(...ibBars.map((c) => c.low)),
        mid: 0,
        session: win.name,
      }
    : null;
  if (ib) ib.mid = (ib.high + ib.low) / 2;

  let orb: AuctionSnap["orb"] = "inside";
  if (ib) {
    const after = candles.filter((c) => c.time >= end);
    const piercedHigh = after.some((c) => c.high > ib.high);
    const piercedLow = after.some((c) => c.low < ib.low);
    if (last.close > ib.high) orb = "broke-high";
    else if (last.close < ib.low) orb = "broke-low";
    else if (piercedHigh) orb = "failed-high";
    else if (piercedLow) orb = "failed-low";
  }

  const weekFrom = last.time - 5 * 86400;
  const weekBars = candles.filter((c) => c.time >= weekFrom);
  const weekHigh = Math.max(...weekBars.map((c) => c.high));
  const weekLow = Math.min(...weekBars.map((c) => c.low));
  const wpos = (last.close - weekLow) / (weekHigh - weekLow || 1);
  const weekWhere: AuctionSnap["week"]["where"] = wpos > 0.66 ? "upper" : wpos < 0.34 ? "lower" : "mid";

  const tr = trueRanges(candles.slice(-40));
  const recent = tr.slice(-14);
  const base = tr.slice(0, Math.max(tr.length - 14, 8));
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 1);
  const atrRatio = avg(recent) / (avg(base) || avg(recent) || 1);
  const vol: AuctionSnap["vol"] =
    atrRatio < 0.72 ? "compressed" : atrRatio > 1.35 ? "expanded" : "normal";

  const because = ib
    ? `${ib.session} ${ib.low.toFixed(last.close > 50 ? 2 : 5)}–${ib.high.toFixed(last.close > 50 ? 2 : 5)}. Неделя: ${weekWhere === "upper" ? "верхняя треть" : weekWhere === "lower" ? "нижняя треть" : "середина"}. ATR×${atrRatio.toFixed(2)}.`
    : `IB сегодня ещё не построен (${win.name}). Неделя: ${weekWhere}. ATR×${atrRatio.toFixed(2)}.`;

  const therefore =
    orb === "broke-high"
      ? "Вышли из IB вверх. Шорт из середины против аукциона — слабый. Лонг — от ретеста края IB, не догон."
      : orb === "broke-low"
        ? "Вышли из IB вниз. Не ловить дно в середине. Шорт — ретест низа IB."
        : orb === "failed-high"
          ? "Вынос верха IB не удержался. Классика ложного пробоя открытия — проще искать шорт от края."
          : orb === "failed-low"
            ? "Вынос низа IB вернули. Часто набор после охоты за стопами утра."
            : vol === "compressed"
              ? "Волатильность сжата. Дальняя цель часто не доезжает. Не ждать полёта из середины IB."
              : vol === "expanded"
                ? "Волатильность расширена. Середину диапазона не ловить — край или ждать."
                : ib
                  ? "Цена внутри IB. Сегодняшний аукцион ещё не выбрал сторону."
                  : "Ждём построение IB сессии.";

  return {
    ib,
    orb,
    week: { high: weekHigh, low: weekLow, where: weekWhere },
    vol,
    atrRatio,
    because,
    therefore,
  };
}

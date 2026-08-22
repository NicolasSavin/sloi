import type { Candle } from "@/lib/market/types";
import { buyVolumeOf, deltaOf } from "@/lib/smc/flow";

export interface MicroSnap {
  vwap: number;
  upper: number;
  lower: number;
  where: "above" | "below" | "inside";
  footprint: { buy: number; sell: number; delta: number; source: "tape" | "proxy" };
  infusion: { price: number; side: "buy" | "sell"; because: string; therefore: string } | null;
  splash: { price: number; side: "buy" | "sell"; because: string; therefore: string } | null;
  because: string;
  therefore: string;
}

export function buildMicro(candles: Candle[]): MicroSnap {
  const use = candles.slice(-48);
  let pv = 0;
  let vv = 0;
  const tps: { tp: number; v: number }[] = [];
  for (const c of use) {
    const tp = (c.high + c.low + c.close) / 3;
    const v = c.volume || 1;
    pv += tp * v;
    vv += v;
    tps.push({ tp, v });
  }
  const vwap = vv > 0 ? pv / vv : use.at(-1)!.close;
  let varSum = 0;
  for (const t of tps) varSum += t.v * (t.tp - vwap) ** 2;
  const sd = Math.sqrt(varSum / (vv || 1));
  const last = use.at(-1)!;
  const upper = vwap + sd;
  const lower = vwap - sd;
  const where: MicroSnap["where"] =
    last.close > upper ? "above" : last.close < lower ? "below" : "inside";

  const tape = candles.some((c) => c.buyVolume != null);
  const buy = buyVolumeOf(last);
  const sell = Math.max(0, last.volume - buy);
  const delta = deltaOf(last);
  const vols = use.map((c) => c.volume);
  const avg = vols.reduce((a, b) => a + b, 0) / Math.max(vols.length, 1);
  const span = last.high - last.low || 1e-9;
  const avgSpan = use.reduce((a, c) => a + (c.high - c.low), 0) / Math.max(use.length, 1);

  let infusion: MicroSnap["infusion"] = null;
  if (last.volume > avg * 2 && span < avgSpan * 0.7) {
    const side = delta >= 0 ? "buy" : "sell";
    infusion = {
      price: last.close,
      side,
      because: `Infusion: объём ${Math.round(last.volume)} при узком диапазоне — лимит впитал агрессию.`,
      therefore:
        side === "buy"
          ? "Поглощение снизу. Часто зона набора, не место шортить в рынок."
          : "Поглощение сверху. Часто раздают, не место ловить отскок.",
    };
  }

  let splash: MicroSnap["splash"] = null;
  if (last.volume > avg * 2.2 && span > avgSpan * 1.4) {
    const side = last.close >= last.open ? "buy" : "sell";
    splash = {
      price: last.close,
      side,
      because: `Splash: широкий бар и всплеск объёма — агрессивный вынос.`,
      therefore:
        side === "buy"
          ? "Сплэш вверх: либо набор после выноса стопов, либо кульминация покупок. Ждём закрытие и реакцию."
          : "Сплэш вниз: либо снятие стопов, либо паника. Не догонять середину бара.",
    };
  }

  const because = `VWAP ${vwap.toFixed(last.close > 50 ? 2 : 5)}. Цена ${where === "above" ? "выше" : where === "below" ? "ниже" : "внутри"} полосы ±1σ. Футпринт бара: Δ ${delta >= 0 ? "+" : ""}${delta.toFixed(0)} (${tape ? "лента" : "оценка ask/bid по телу свечи"}).`;
  const therefore =
    where === "above"
      ? "Выше VWAP крупные лимиты чаще защищают лонг; шорт только из премии к профилю."
      : where === "below"
        ? "Ниже VWAP — дисконт к средневзвешенной. Лонг от VAL/VWAP, не от середины выноса."
        : "Цена в value. Крупняк спокоен, импульса из профиля нет.";

  return {
    vwap,
    upper,
    lower,
    where,
    footprint: { buy, sell, delta, source: tape ? "tape" : "proxy" },
    infusion,
    splash,
    because,
    therefore,
  };
}

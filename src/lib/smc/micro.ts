import type { Candle } from "@/lib/market/types";
import { buyVolumeOf, deltaOf } from "@/lib/smc/flow";

export function barVolume(c: Candle) {
  return (c.cmeVolume != null && c.cmeVolume > 0 ? c.cmeVolume : c.volume) || 1;
}

export interface VolumeMark {
  price: number;
  side: "buy" | "sell";
  because: string;
  therefore: string;
}

export interface VolumeNode {
  price: number;
  side: "buy" | "sell";
  kind: "infusion" | "splash";
  time: number;
}

export interface MicroSnap {
  vwap: number;
  upper: number;
  lower: number;
  where: "above" | "below" | "inside";
  footprint: { buy: number; sell: number; delta: number; source: "tape" | "proxy" | "cme-delayed" };
  infusion: VolumeMark | null;
  splash: VolumeMark | null;
  nodes: VolumeNode[];
  cmeTicker: string | null;
  because: string;
  therefore: string;
}

export function nearestInfusionAhead(nodes: VolumeNode[], entry: number, dir: 1 | -1, atr: number) {
  const minAway = Math.max(atr * 0.8, Math.abs(entry) * 0.0004);
  const hits = nodes
    .filter((n) => n.kind === "infusion")
    .filter((n) => (dir > 0 ? n.price > entry + minAway : n.price < entry - minAway))
    .sort((a, b) => (dir > 0 ? a.price - b.price : b.price - a.price));
  return hits[0] ?? null;
}

export function nearestStall(entry: number, dir: 1 | -1, atr: number, nodes: VolumeNode[], hvn: number[]) {
  const inf = nearestInfusionAhead(nodes, entry, dir, atr);
  const minAway = Math.max(atr * 0.8, Math.abs(entry) * 0.0004);
  const cluster = hvn
    .filter((p) => (dir > 0 ? p > entry + minAway : p < entry - minAway))
    .sort((a, b) => (dir > 0 ? a - b : b - a))[0];
  const prices = [inf?.price, cluster].filter((n): n is number => n != null);
  if (!prices.length) return null;
  const price = dir > 0 ? Math.min(...prices) : Math.max(...prices);
  const from = inf && Math.abs(inf.price - price) < atr * 0.2 ? "infusion" : cluster != null && Math.abs(cluster - price) < atr * 0.2 ? "hvn" : "infusion";
  return { price, from: from as "infusion" | "hvn" };
}

export function buildMicro(candles: Candle[]): MicroSnap {
  const use = candles.slice(-80);
  let pv = 0;
  let vv = 0;
  const tps: { tp: number; v: number }[] = [];
  for (const c of use) {
    const tp = (c.high + c.low + c.close) / 3;
    const v = barVolume(c);
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
  const cme = candles.some((c) => (c.cmeVolume ?? 0) > 0);
  const buy = buyVolumeOf(last);
  const sell = Math.max(0, last.volume - buy);
  const delta = deltaOf(last);
  const vols = use.map((c) => barVolume(c));
  const avg = vols.reduce((a, b) => a + b, 0) / Math.max(vols.length, 1);
  const span = last.high - last.low || 1e-9;
  const avgSpan = use.reduce((a, c) => a + (c.high - c.low), 0) / Math.max(use.length, 1);
  const atrLike = avgSpan || span;
  const cmeTicker = last.cmeTicker ?? candles.find((c) => c.cmeTicker)?.cmeTicker ?? null;

  const raw: VolumeNode[] = [];
  for (const c of use) {
    const barSpan = c.high - c.low || 1e-9;
    const d = deltaOf(c);
    const v = barVolume(c);
    if (v > avg * 1.8 && barSpan < avgSpan * 0.75) {
      raw.push({
        price: (c.high + c.low) / 2,
        side: d >= 0 ? "buy" : "sell",
        kind: "infusion",
        time: c.time,
      });
    } else if (v > avg * 2.2 && barSpan > avgSpan * 1.35) {
      raw.push({
        price: c.close,
        side: c.close >= c.open ? "buy" : "sell",
        kind: "splash",
        time: c.time,
      });
    }
  }
  const nodes: VolumeNode[] = [];
  for (const n of raw) {
    const near = nodes.find((x) => x.kind === n.kind && Math.abs(x.price - n.price) < atrLike * 0.35);
    if (near) {
      near.price = (near.price + n.price) / 2;
      near.time = n.time;
      near.side = n.side;
    } else nodes.push({ ...n });
  }

  let infusion: MicroSnap["infusion"] = null;
  if (barVolume(last) > avg * 2 && span < avgSpan * 0.7) {
    const side = delta >= 0 ? "buy" : "sell";
    infusion = {
      price: last.close,
      side,
      because: `Infusion${cme ? " CME" : ""}: объём ${Math.round(barVolume(last))} при узком диапазоне — лимит впитал агрессию.`,
      therefore:
        side === "buy"
          ? "Остановка снизу (набор). Цель шорта — сюда. Лонг — от этой лужи, не сквозь неё."
          : "Остановка сверху (раздача). Цель лонга — сюда. Шорт — от этой лужи, не в середину.",
    };
  }

  let splash: MicroSnap["splash"] = null;
  if (barVolume(last) > avg * 2.2 && span > avgSpan * 1.4) {
    const side = last.close >= last.open ? "buy" : "sell";
    splash = {
      price: last.close,
      side,
      because: `Splash${cme ? " CME" : ""}: широкий бар и всплеск объёма — агрессивный вынос.`,
      therefore:
        side === "buy"
          ? "Сплэш вверх: стопы или старт. Не цель. Ждём закрытие."
          : "Сплэш вниз: стопы или паника. Не цель и не догон середины бара.",
    };
  }

  const src = tape ? "лента" : cme ? `CME ${cmeTicker ?? ""} задержка ~10м` : "оценка по свече";
  const because = `VWAP ${vwap.toFixed(last.close > 50 ? 2 : 5)}. Объём: ${src}. Δ ${delta >= 0 ? "+" : ""}${delta.toFixed(0)}.`;
  const therefore = cme
    ? "Кластеры и infusion считаем по объёму фьючерса Yahoo/CME (не скальп). Тейк — в остановку, опцион — как магнит OI."
    : where === "above"
      ? "Выше VWAP крупные лимиты чаще защищают лонг; тейк — в чужой infusion."
      : where === "below"
        ? "Ниже VWAP — дисконт. Лонг от VAL/VWAP, цель — infusion сверху."
        : "Цена в value. Крупняк спокоен.";

  return {
    vwap,
    upper,
    lower,
    where,
    footprint: { buy, sell, delta, source: tape ? "tape" : cme ? "cme-delayed" : "proxy" },
    infusion,
    splash,
    nodes: nodes.slice(-16),
    cmeTicker,
    because,
    therefore,
  };
}

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

export function buildMicro(candles: Candle[], live: VolumeNode[] = []): MicroSnap {
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
  const sorted = [...vols].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] || 1;
  const p80 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.8))] || median;
  const thresh = Math.max(median * 1.85, p80);
  const spans = use.map((c) => c.high - c.low);
  const spanMed = [...spans].sort((a, b) => a - b)[Math.floor(spans.length / 2)] || 1e-9;
  const avgSpan = spans.reduce((a, b) => a + b, 0) / Math.max(spans.length, 1);
  const atrLike = spanMed || avgSpan;
  const cmeTicker = last.cmeTicker ?? candles.find((c) => c.cmeTicker)?.cmeTicker ?? null;

  // ProVolume Cluster Search: порог свой на инструмент/ТФ (медиана+80%). 
  // Крупный объём + узкий бар + слабая дельта = остановка (infusion / вливание).
  // Крупный объём + широкий бар + сильная дельта = толчок (splash).
  const raw: VolumeNode[] = [];
  for (const c of use) {
    const barSpan = c.high - c.low || 1e-9;
    const d = deltaOf(c);
    const v = barVolume(c);
    if (v < thresh) continue;
    const rangeRatio = barSpan / spanMed;
    const deltaShare = Math.abs(d) / v;
    const body = Math.abs(c.close - c.open) / barSpan;
    if (rangeRatio < 0.88 && deltaShare < 0.48) {
      raw.push({
        price: (c.high + c.low) / 2,
        side: d >= 0 ? "buy" : "sell",
        kind: "infusion",
        time: c.time,
      });
    } else if (rangeRatio > 1.22 && deltaShare > 0.32 && body > 0.5) {
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
  if (live.length) {
    const merged: VolumeNode[] = live.map((n) => ({ ...n }));
    for (const n of nodes) {
      if (!merged.some((x) => x.kind === n.kind && Math.abs(x.price - n.price) < atrLike * 0.35)) merged.push(n);
    }
    nodes.length = 0;
    nodes.push(...merged);
  }

  const step = last.time - (use.at(-2)?.time ?? last.time - 3600_000);
  const fresh = (t: number) => last.time - t <= step * 5;

  let infusion: MicroSnap["infusion"] = null;
  const lastInf = [...nodes].reverse().find((n) => n.kind === "infusion");
  if (lastInf) {
    infusion = {
      price: lastInf.price,
      side: lastInf.side,
      because: `Вливание (Cluster Search): объём выше порога ТФ (${Math.round(thresh)}), бар узкий, дельта слабая — лимит впитал удар.`,
      therefore:
        lastInf.side === "buy"
          ? "Остановка снизу. Цель шорта — сюда. Лонг от этой лужи, не сквозь неё."
          : "Остановка сверху. Цель лонга — сюда. Шорт от лужи, не в середину.",
    };
  }

  let splash: MicroSnap["splash"] = null;
  const lastSplash = [...nodes].reverse().find((n) => n.kind === "splash" && fresh(n.time));
  if (lastSplash) {
    splash = {
      price: lastSplash.price,
      side: lastSplash.side,
      because: `Сплэш (Cluster Search): объём выше порога и бар широкий — объём толкнул цену (стопы или старт).`,
      therefore:
        lastSplash.side === "buy"
          ? "Вынос вверх. Не цель. Ждём закрытие и возврат."
          : "Вынос вниз. Не цель и не догон середины бара.",
    };
  }

  const src = tape
    ? "лента"
    : live.length
      ? "ProVolume с терминала"
      : cme
        ? `CME ${cmeTicker ?? ""} задержка ~10м`
        : "оценка по свече";
  const because = `VWAP ${vwap.toFixed(last.close > 50 ? 2 : 5)}. Объём: ${src}. Порог Cluster Search ${Math.round(thresh)}. Δ ${delta >= 0 ? "+" : ""}${delta.toFixed(0)}.`;
  const therefore = live.length
    ? "Вливание/сплэш с графика ProVolume идут в приказ: сплэш против — ждём, тейк — во вливание."
    : cme
    ? "Splash/infusion как у FxForTrader ProVolume: крупный объём либо толкает (splash), либо останавливает (вливание). Тейк — в остановку."
    : where === "above"
      ? "Выше VWAP лимиты чаще защищают лонг; тейк — в чужое вливание."
      : where === "below"
        ? "Ниже VWAP — дисконт. Лонг от VAL/VWAP, цель — вливание сверху."
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

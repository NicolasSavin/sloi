import type { Candle, MarketKind, OptionsSnapshot } from "@/lib/market/types";
import { detectPatterns, detectWyckoff, type PatternHit, type WyckoffRead } from "@/lib/smc/patterns";
import { buildFlow, locateEdgeDiv, type FlowSnap } from "@/lib/smc/flow";
import { clustersFromCandles, clustersFromTrades, type ClusterMap } from "@/lib/smc/clusters";
import { barVolume, buildMicro, buildSweepFuel, nearestStall, type MicroSnap, type SweepFuel } from "@/lib/smc/micro";
import { buildAuction, type AuctionSnap } from "@/lib/smc/auction";
import { buildCoilBreak, type CoilBreak } from "@/lib/smc/coil";
import { buildCorr, type CorrSnap } from "@/lib/corr";
import { buildIvNews, type IvNewsSnap } from "@/lib/iv-news";
import { brokerBook, liveAskBid, liveCdBars, liveCdFlow, liveClusters, liveProfile } from "@/lib/broker-tape";
import type { NewsHalt } from "@/lib/calendar";

export type Bias = "bullish" | "bearish" | "range";
export type Side = "bull" | "bear";

export interface Swing {
  index: number;
  time: number;
  price: number;
  type: "high" | "low";
}

export interface StructureEvent {
  time: number;
  price: number;
  kind: "BOS" | "CHoCH";
  side: Side;
  index: number;
}

export interface Zone {
  id: string;
  kind: "fvg" | "ob" | "breaker" | "mitigation";
  side: Side;
  top: number;
  bottom: number;
  startTime: number;
  endTime: number;
  mitigated: boolean;
}

export function zoneReach(z: Pick<Zone, "top" | "bottom" | "mitigated">, last: number, atr: number): number | null {
  if (z.mitigated || atr <= 0) return null;
  const lo = Math.min(z.top, z.bottom);
  const hi = Math.max(z.top, z.bottom);
  if (last >= lo && last <= hi) return 0;
  const d = last < lo ? lo - last : last - hi;
  if (d > atr * 2.2) return null;
  return d;
}

export function zoneName(z: Pick<Zone, "kind" | "side">): string {
  if (z.kind === "breaker") return z.side === "bull" ? "бычий брейкер" : "медвежий брейкер";
  if (z.kind === "mitigation") return z.side === "bull" ? "митигейшн покупок" : "митигейшн продаж";
  if (z.kind === "ob") return z.side === "bull" ? "блок покупок" : "блок продаж";
  return z.side === "bull" ? "бычий FVG" : "медвежий FVG";
}

export interface LiquidityPool {
  price: number;
  time: number;
  side: "buy" | "sell";
  equal: boolean;
  swept: boolean;
  sweptTime: number | null;
}

export interface Divergence {
  side: Side;
  kind: "regular" | "hidden";
  priceTime: number;
  note: string;
}

export interface WaveLabel {
  time: number;
  price: number;
  label: string;
}

export interface ConfluenceItem {
  id: string;
  layer: string;
  status: "for" | "against" | "neutral";
  note: string;
}

export interface MarginMagnet {
  price: number;
  kind: "round" | "eqh" | "eql";
  name: string;
}

export interface MarginBand {
  side: "upper" | "lower";
  top: number;
  bottom: number;
  active: boolean;
  name: string;
  hint: string;
}

export interface MarginMap {
  upper: MarginBand;
  lower: MarginBand;
  magnets: MarginMagnet[];
  where: "upper" | "lower" | "inside";
}

export interface LocalSetup {
  thesis: string;
  entry: number | null;
  stop: number | null;
  targets: number[];
  invalidation: string;
}

export interface StoryBeat {
  because: string;
  therefore: string;
}

export interface MarketStory {
  now: string;
  chain: StoryBeat[];
  means: string;
  ifHolds: string;
  ifBreaks: string;
  doing: string;
  waiting: string;
  leadsTo: string;
}

export interface SmcSnapshot {
  bias: Bias;
  trend: "up" | "down" | "range";
  lastClose: number;
  lastChangePct: number;
  atr: number;
  dealingRange: { high: number; low: number; eq: number };
  premiumDiscount: "premium" | "discount" | "equilibrium";
  ote: { high: number; low: number };
  swings: Swing[];
  events: StructureEvent[];
  orderBlocks: Zone[];
  fvgs: Zone[];
  liquidity: LiquidityPool[];
  margin: MarginMap;
  volumeProfile: {
    poc: number;
    dpoc: number;
    dpocPath: { time: number; price: number }[];
    vah: number;
    val: number;
    bins: { price: number; volume: number }[];
  };
  divergences: Divergence[];
  waves: WaveLabel[];
  patterns: PatternHit[];
  wyckoff: WyckoffRead;
  flow: FlowSnap;
  clusters: ClusterMap;
  micro: MicroSnap;
  sweepFuel: SweepFuel | null;
  cdTape: {
    live: boolean;
    ask: number | null;
    bid: number | null;
    volume: number | null;
    delta: number | null;
    splash: boolean;
    infusion: boolean;
    book: { side: "bid" | "ask"; price: number; volume: number }[];
    bars: { time: number; volume: number; delta: number; ask: number; bid: number; splash: boolean; infusion: boolean; imbalance: boolean }[];
  };
  auction: AuctionSnap;
  coil: CoilBreak;
  boxVector: BoxVector;
  corr: CorrSnap;
  ivNews: IvNewsSnap;
  killzone: { name: string; active: boolean }[];
  confluence: ConfluenceItem[];
  score: number;
  localSetup: LocalSetup;
  story: MarketStory;
}

const SWING = 3;

function avgTrueRange(candles: Candle[], period = 14): number {
  if (candles.length < 2) return 0;
  let sum = 0;
  const n = Math.min(period, candles.length - 1);
  for (let i = candles.length - n; i < candles.length; i++) {
    const c = candles[i]!;
    const prev = candles[i - 1]!;
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low - prev.close),
    );
    sum += tr;
  }
  return sum / n;
}

function findSwings(candles: Candle[], left = SWING, right = SWING): Swing[] {
  const out: Swing[] = [];
  for (let i = left; i < candles.length - right; i++) {
    const c = candles[i]!;
    let isHigh = true;
    let isLow = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (candles[j]!.high >= c.high) isHigh = false;
      if (candles[j]!.low <= c.low) isLow = false;
    }
    if (isHigh) out.push({ index: i, time: c.time, price: c.high, type: "high" });
    else if (isLow) out.push({ index: i, time: c.time, price: c.low, type: "low" });
  }
  return out;
}

function rsi(closes: number[], period = 14): number[] {
  const r = Array.from({ length: closes.length }, () => NaN);
  if (closes.length <= period) return r;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i]! - closes[i - 1]!;
    if (d >= 0) avgGain += d;
    else avgLoss -= d;
  }
  avgGain /= period;
  avgLoss /= period;
  r[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i]! - closes[i - 1]!;
    const gain = Math.max(d, 0);
    const loss = Math.max(-d, 0);
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    r[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return r;
}

function volumeProfile(candles: Candle[], bins = 24) {
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const hi = Math.max(...highs);
  const lo = Math.min(...lows);
  const span = hi - lo || 1;
  const vol = Array.from({ length: bins }, () => 0);
  let pv = 0;
  let vv = 0;
  for (const c of candles) {
    const typical = (c.high + c.low + c.close) / 3;
    const raw = barVolume(c);
    const v = raw > 1 ? raw : Math.max(c.high - c.low, span / 1000);
    pv += typical * v;
    vv += v;
    const i = Math.min(bins - 1, Math.max(0, Math.floor(((c.close - lo) / span) * bins)));
    vol[i]! += v;
  }
  const vwap = vv > 0 ? pv / vv : candles.at(-1)?.close ?? lo;
  const peak = Math.max(...vol);
  const flat = peak <= 0 || vol.every((x) => Math.abs(x - vol[0]!) < 1e-9);
  let pocIdx = 0;
  for (let i = 1; i < bins; i++) if (vol[i]! > vol[pocIdx]!) pocIdx = i;
  const target = vol.reduce((a, b) => a + b, 0) * 0.7 || 1;
  let acc = vol[pocIdx]!;
  let loIdx = pocIdx;
  let hiIdx = pocIdx;
  while (acc < target && (loIdx > 0 || hiIdx < bins - 1)) {
    const down = loIdx > 0 ? vol[loIdx - 1]! : -1;
    const up = hiIdx < bins - 1 ? vol[hiIdx + 1]! : -1;
    if (up >= down) {
      hiIdx += 1;
      acc += vol[hiIdx]!;
    } else {
      loIdx -= 1;
      acc += vol[loIdx]!;
    }
  }
  const priceOf = (i: number) => lo + ((i + 0.5) / bins) * span;
  const poc = flat ? vwap : priceOf(pocIdx);
  return {
    poc,
    vah: priceOf(hiIdx),
    val: priceOf(loIdx),
    bins: vol.map((v, i) => ({ price: priceOf(i), volume: v })),
  };
}

function detectStructure(
  candles: Candle[],
  swings: Swing[],
  chochClose = false,
): {
  trend: "up" | "down" | "range";
  events: StructureEvent[];
} {
  const events: StructureEvent[] = [];
  if (swings.length < 4) return { trend: "range", events };
  let trend: "up" | "down" | "range" = "range";
  let lastHigh = swings.find((s) => s.type === "high");
  let lastLow = swings.find((s) => s.type === "low");
  for (let i = 1; i < swings.length; i++) {
    const s = swings[i]!;
    const bar = candles[s.index];
    if (s.type === "high" && lastHigh) {
      const wickBreak = s.price > lastHigh.price;
      const closeBreak = bar != null && bar.close > lastHigh.price;
      if (wickBreak && (!chochClose || closeBreak)) {
        const kind = trend === "down" ? "CHoCH" : "BOS";
        events.push({
          time: s.time,
          price: s.price,
          kind,
          side: "bull",
          index: s.index,
        });
        trend = "up";
      }
      lastHigh = s;
    }
    if (s.type === "low" && lastLow) {
      const wickBreak = s.price < lastLow.price;
      const closeBreak = bar != null && bar.close < lastLow.price;
      if (wickBreak && (!chochClose || closeBreak)) {
        const kind = trend === "up" ? "CHoCH" : "BOS";
        events.push({
          time: s.time,
          price: s.price,
          kind,
          side: "bear",
          index: s.index,
        });
        trend = "down";
      }
      lastLow = s;
    }
  }
  return { trend, events };
}

function detectFvgs(candles: Candle[]): Zone[] {
  const zones: Zone[] = [];
  for (let i = 2; i < candles.length; i++) {
    const a = candles[i - 2]!;
    const c = candles[i]!;
    if (a.high < c.low) {
      const mitigated = candles.slice(i + 1).some((x) => x.low <= a.high);
      zones.push({
        id: `fvg-b-${i}`,
        kind: "fvg",
        side: "bull",
        top: c.low,
        bottom: a.high,
        startTime: a.time,
        endTime: c.time,
        mitigated,
      });
    } else if (a.low > c.high) {
      const mitigated = candles.slice(i + 1).some((x) => x.high >= a.low);
      zones.push({
        id: `fvg-s-${i}`,
        kind: "fvg",
        side: "bear",
        top: a.low,
        bottom: c.high,
        startTime: a.time,
        endTime: c.time,
        mitigated,
      });
    }
  }
  return zones.filter((z) => !z.mitigated).slice(-12);
}

function detectOrderBlocks(candles: Candle[], events: StructureEvent[]): Zone[] {
  const zones: Zone[] = [];
  const lastEvents = events.slice(-8);
  for (const ev of lastEvents) {
    const from = Math.max(0, ev.index - 8);
    if (ev.side === "bull") {
      for (let i = ev.index - 1; i >= from; i--) {
        const c = candles[i]!;
        if (c.close < c.open) {
          zones.push(classifyBlock(`ob-b-${i}`, "bull", c, candles, ev));
          break;
        }
      }
    } else {
      for (let i = ev.index - 1; i >= from; i--) {
        const c = candles[i]!;
        if (c.close > c.open) {
          zones.push(classifyBlock(`ob-s-${i}`, "bear", c, candles, ev));
          break;
        }
      }
    }
  }
  return zones.filter((z) => !z.mitigated).slice(-10);
}

function classifyBlock(
  id: string,
  origin: Side,
  c: Candle,
  candles: Candle[],
  ev: StructureEvent,
): Zone {
  const top = origin === "bull" ? Math.max(c.open, c.close) : c.high;
  const bottom = origin === "bull" ? c.low : Math.min(c.open, c.close);
  const after = candles.slice(ev.index + 1);
  const breakAt = after.findIndex((x) => (origin === "bull" ? x.close < bottom : x.close > top));
  if (breakAt >= 0) {
    const side: Side = origin === "bull" ? "bear" : "bull";
    const rest = after.slice(breakAt + 1);
    const dead = side === "bear" ? rest.some((x) => x.close > top) : rest.some((x) => x.close < bottom);
    return {
      id: `brk-${id}`,
      kind: "breaker",
      side,
      top,
      bottom,
      startTime: c.time,
      endTime: candles[ev.index]!.time,
      mitigated: dead,
    };
  }
  const tapped =
    origin === "bull"
      ? after.some((x) => x.low <= top && x.high >= bottom)
      : after.some((x) => x.high >= bottom && x.low <= top);
  return {
    id,
    kind: tapped ? "mitigation" : "ob",
    side: origin,
    top,
    bottom,
    startTime: c.time,
    endTime: candles[ev.index]!.time,
    mitigated: false,
  };
}

function detectLiquidity(candles: Candle[], swings: Swing[], atr: number): LiquidityPool[] {
  const pools: LiquidityPool[] = [];
  const last = candles[candles.length - 1]!;
  const highs = swings.filter((s) => s.type === "high").slice(-8);
  const lows = swings.filter((s) => s.type === "low").slice(-8);
  const tol = atr * 0.25 || last.close * 0.001;
  const firstTake = (after: number, side: "buy" | "sell", price: number) => {
    for (const c of candles) {
      if (c.time <= after) continue;
      if (side === "buy" && c.high > price + tol * 0.2) return c.time;
      if (side === "sell" && c.low < price - tol * 0.2) return c.time;
    }
    return null;
  };

  for (const a of highs) {
    const equal = highs.some((b) => b !== a && Math.abs(b.price - a.price) <= tol);
    const takeTime = firstTake(a.time, "buy", a.price);
    const back =
      takeTime != null &&
      candles.some((c) => c.time >= takeTime && c.close < a.price);
    pools.push({
      price: a.price,
      time: a.time,
      side: "buy",
      equal,
      swept: back,
      sweptTime: takeTime,
    });
  }
  for (const a of lows) {
    const equal = lows.some((b) => b !== a && Math.abs(b.price - a.price) <= tol);
    const takeTime = firstTake(a.time, "sell", a.price);
    const back =
      takeTime != null &&
      candles.some((c) => c.time >= takeTime && c.close > a.price);
    pools.push({
      price: a.price,
      time: a.time,
      side: "sell",
      equal,
      swept: back,
      sweptTime: takeTime,
    });
  }
  return pools.slice(-10);
}

export interface BoxVector {
  dir: "up" | "down" | "none";
  magnet: number | null;
  swept: number | null;
  because: string;
}

export function buildBoxVector(
  last: Candle,
  range: { high: number; low: number; eq: number },
  liq: LiquidityPool[],
  candles: Candle[],
): BoxVector {
  const none: BoxVector = {
    dir: "none",
    magnet: null,
    swept: null,
    because: "Оба края коробки целы или оба сняты. Вектора нет — только ждать выноса.",
  };
  const span = range.high - range.low;
  if (!(span > 0)) return none;
  const sellSwept = liq.filter((l) => l.side === "sell" && l.swept);
  const buySwept = liq.filter((l) => l.side === "buy" && l.swept);
  const magnetUp = liq
    .filter((l) => l.side === "buy" && !l.swept && l.price > last.close)
    .sort((a, b) => a.price - b.price)[0];
  const magnetDn = liq
    .filter((l) => l.side === "sell" && !l.swept && l.price < last.close)
    .sort((a, b) => b.price - a.price)[0];
  const ssl = sellSwept.at(-1);
  const bsl = buySwept.at(-1);
  const recent = candles.slice(-10);
  const tookLow = recent.some((c) => c.low <= range.low + span * 0.06);
  const tookHigh = recent.some((c) => c.high >= range.high - span * 0.06);
  const fmt = (n: number) => (n > 50 ? n.toFixed(2) : n.toFixed(5));

  if ((ssl || tookLow) && magnetUp && !tookHigh) {
    const swept = ssl?.price ?? range.low;
    return {
      dir: "up",
      magnet: magnetUp.price,
      swept,
      because: `Снизу ликвидность сняли (${fmt(swept)}). Сверху лужа ${fmt(magnetUp.price)} цела. Вектор коробки вверх, вход не из середины.`,
    };
  }
  if ((bsl || tookHigh) && magnetDn && !tookLow) {
    const swept = bsl?.price ?? range.high;
    return {
      dir: "down",
      magnet: magnetDn.price,
      swept,
      because: `Сверху ликвидность сняли (${fmt(swept)}). Снизу лужа ${fmt(magnetDn.price)} цела. Вектор коробки вниз, вход не из середины.`,
    };
  }
  if (tookLow && !tookHigh) {
    return {
      dir: "up",
      magnet: range.high,
      swept: range.low,
      because: `Низ коробки вынесли, верх ${fmt(range.high)} цел. Вектор вверх к неснятой ликвидности.`,
    };
  }
  if (tookHigh && !tookLow) {
    return {
      dir: "down",
      magnet: range.low,
      swept: range.high,
      because: `Верх коробки вынесли, низ ${fmt(range.low)} цел. Вектор вниз к неснятой ликвидности.`,
    };
  }
  if (last.close >= range.high - span * 0.21 && !tookHigh) {
    return {
      dir: "up",
      magnet: range.high,
      swept: null,
      because: `Верхняя маржа: топливо (стопы и маржин-коллы у ${fmt(range.high)}) ещё не снято. Крупняк часто сначала идёт за ним, разворот — после выноса, не до.`,
    };
  }
  if (last.close <= range.low + span * 0.21 && !tookLow) {
    return {
      dir: "down",
      magnet: range.low,
      swept: null,
      because: `Нижняя маржа: топливо у ${fmt(range.low)} ещё цело. Сначала вынос маржи, набор — после съёма, не шорт в середину давления.`,
    };
  }
  return none;
}

function detectDivergence(candles: Candle[], swings: Swing[]): Divergence[] {
  const closes = candles.map((c) => c.close);
  const r = rsi(closes);
  const out: Divergence[] = [];
  const highs = swings.filter((s) => s.type === "high").slice(-4);
  const lows = swings.filter((s) => s.type === "low").slice(-4);
  if (highs.length >= 2) {
    const a = highs[highs.length - 2]!;
    const b = highs[highs.length - 1]!;
    const ra = r[a.index];
    const rb = r[b.index];
    if (Number.isFinite(ra) && Number.isFinite(rb) && b.price > a.price && rb! < ra!) {
      out.push({
        side: "bear",
        kind: "regular",
        priceTime: b.time,
        note: "Цена выше максимум, RSI ниже. Обычная медвежья дивергенция — импульс вверх слабеет.",
      });
    } else if (Number.isFinite(ra) && Number.isFinite(rb) && b.price < a.price && rb! > ra!) {
      out.push({
        side: "bear",
        kind: "hidden",
        priceTime: b.time,
        note: "Цена ниже максимум, RSI выше. Скрытая медвежья — часто продолжение падения после отката.",
      });
    }
  }
  if (lows.length >= 2) {
    const a = lows[lows.length - 2]!;
    const b = lows[lows.length - 1]!;
    const ra = r[a.index];
    const rb = r[b.index];
    if (Number.isFinite(ra) && Number.isFinite(rb) && b.price < a.price && rb! > ra!) {
      out.push({
        side: "bull",
        kind: "regular",
        priceTime: b.time,
        note: "Цена ниже минимум, RSI выше. Обычная бычья дивергенция — продажи выдыхаются.",
      });
    } else if (Number.isFinite(ra) && Number.isFinite(rb) && b.price > a.price && rb! < ra!) {
      out.push({
        side: "bull",
        kind: "hidden",
        priceTime: b.time,
        note: "Цена выше минимум, RSI ниже. Скрытая бычья — часто продолжение роста после отката.",
      });
    }
  }
  return out;
}

function detectWaves(swings: Swing[]): WaveLabel[] {
  if (swings.length < 6) return [];
  const seq = swings.slice(-6);
  const labels: WaveLabel[] = [];
  const first = seq[0]!;
  const impulseUp =
    first.type === "low" &&
    seq[1]?.type === "high" &&
    seq[2]?.type === "low" &&
    seq[3]?.type === "high" &&
    seq[4]?.type === "low" &&
    seq[5]?.type === "high";
  const impulseDown =
    first.type === "high" &&
    seq[1]?.type === "low" &&
    seq[2]?.type === "high" &&
    seq[3]?.type === "low" &&
    seq[4]?.type === "high" &&
    seq[5]?.type === "low";
  if (impulseUp || impulseDown) {
    const names = ["1", "2", "3", "4", "5", "A"];
    seq.forEach((s, i) => {
      labels.push({ time: s.time, price: s.price, label: names[i]! });
    });
  }
  return labels;
}

function killzones(lastTime: number) {
  const hour = new Date(lastTime * 1000).getUTCHours();
  const zones = [
    { name: "Asia", start: 0, end: 3 },
    { name: "London", start: 7, end: 10 },
    { name: "NY AM", start: 12, end: 15 },
    { name: "Silver Bullet", start: 12, end: 13 },
  ];
  return zones.map((z) => ({
    name: z.name,
    active: hour >= z.start && hour < z.end,
  }));
}

function nearestZone(zones: Zone[], price: number): Zone | undefined {
  return [...zones].sort((a, b) => {
    const midA = (a.top + a.bottom) / 2;
    const midB = (b.top + b.bottom) / 2;
    return Math.abs(midA - price) - Math.abs(midB - price);
  })[0];
}

function buildSetup(
  last: Candle,
  trend: "up" | "down" | "range",
  pd: SmcSnapshot["premiumDiscount"],
  fvgs: Zone[],
  obs: Zone[],
  liq: LiquidityPool[],
  range: { high: number; low: number; eq: number },
  atr: number,
  micro: MicroSnap,
  hvn: number[],
): LocalSetup {
  const bullZ =
    nearestZone(
      fvgs.filter((z) => z.side === "bull"),
      last.close,
    ) ??
    nearestZone(
      obs.filter((z) => z.side === "bull" && z.kind === "mitigation"),
      last.close,
    ) ??
    nearestZone(
      obs.filter((z) => z.side === "bull" && z.kind === "ob"),
      last.close,
    ) ??
    nearestZone(
      obs.filter((z) => z.side === "bull" && z.kind === "breaker"),
      last.close,
    );
  const bearZ =
    nearestZone(
      fvgs.filter((z) => z.side === "bear"),
      last.close,
    ) ??
    nearestZone(
      obs.filter((z) => z.side === "bear" && z.kind === "mitigation"),
      last.close,
    ) ??
    nearestZone(
      obs.filter((z) => z.side === "bear" && z.kind === "ob"),
      last.close,
    ) ??
    nearestZone(
      obs.filter((z) => z.side === "bear" && z.kind === "breaker"),
      last.close,
    );
  const width = Math.max(range.high - range.low, atr);
  const longWanted = trend === "up" || (trend === "range" && last.close <= range.low + width * 0.28);
  const shortWanted = trend === "down" || (trend === "range" && last.close >= range.high - width * 0.28);

  if (!longWanted && !shortWanted) {
    return {
      thesis: "Середина диапазона. Края нет — сигнала нет.",
      entry: null,
      stop: null,
      targets: [],
      invalidation: "Ждём край или CHoCH.",
    };
  }

  if (longWanted && !shortWanted) {
    const zone = bullZ;
    if (!zone) {
      return {
        thesis: "Бычья идея, но нет живого FVG/блока/брейкера. Синтетический край не ставим.",
        entry: null,
        stop: null,
        targets: [],
        invalidation: "Ждём бычий блок или гэп.",
      };
    }
    const entry = (zone.top + zone.bottom) / 2;
    const stop = Math.min(zone.bottom, entry) - atr * 1.15;
    const buyLiq = liq.filter((l) => l.side === "buy").sort((a, b) => a.price - b.price);
    const structural = [range.eq, buyLiq.at(-1)?.price ?? range.high, range.high].filter(
      (t, i, a) => t > entry && a.indexOf(t) === i,
    );
    const stall = nearestStall(entry, 1, atr, micro.nodes, hvn);
    const targets = stall
      ? [stall.price, ...structural.filter((t) => t > stall.price + atr * 0.25)]
      : structural;
    return {
      thesis: stall
        ? `Лонг от зоны. TP1 — ${stall.from === "hvn" ? "кластер HVN" : "infusion"} ${stall.price.toFixed(last.close > 50 ? 2 : 5)} (остановка объёма CME/профиля).`
        : pd === "premium"
          ? "Структура вверх. Лимит в дисконт — цена ещё не в зоне, ордер уже рабочий."
          : `Лонг от ${zoneName(zone)}. Реакция в зоне, не догон.`,
      entry,
      stop,
      targets: targets.slice(0, 3),
      invalidation: "Закрытие ниже стопа / последнего HL.",
    };
  }
  if (shortWanted) {
    const zone = bearZ;
    if (!zone) {
      return {
        thesis: "Медвежья идея, но нет живого FVG/блока/брейкера. Синтетический край не ставим.",
        entry: null,
        stop: null,
        targets: [],
        invalidation: "Ждём медвежий блок или гэп.",
      };
    }
    const entry = (zone.top + zone.bottom) / 2;
    const stop = Math.max(zone.top, entry) + atr * 1.15;
    const sellLiq = liq.filter((l) => l.side === "sell").sort((a, b) => b.price - a.price);
    const structural = [range.eq, sellLiq.at(-1)?.price ?? range.low, range.low].filter(
      (t, i, a) => t < entry && a.indexOf(t) === i,
    );
    const stall = nearestStall(entry, -1, atr, micro.nodes, hvn);
    const targets = stall
      ? [stall.price, ...structural.filter((t) => t < stall.price - atr * 0.25)]
      : structural;
    return {
      thesis: stall
        ? `Шорт от зоны. TP1 — ${stall.from === "hvn" ? "кластер HVN" : "infusion"} ${stall.price.toFixed(last.close > 50 ? 2 : 5)} (остановка объёма CME/профиля).`
        : pd === "discount"
          ? "Структура вниз. Лимит в премию — цена ещё не в зоне, ордер уже рабочий."
          : `Шорт от ${zoneName(zone)}. Реакция в зоне, не догон.`,
      entry,
      stop,
      targets: targets.slice(0, 3),
      invalidation: "Закрытие выше стопа / последнего LH.",
    };
  }
  return {
    thesis: "Нет чистого сценария.",
    entry: null,
    stop: null,
    targets: [],
    invalidation: "Ждём структуру.",
  };
}

function roundStep(price: number) {
  if (price >= 2000) return 25;
  if (price >= 500) return 10;
  if (price >= 80) return 5;
  if (price >= 20) return 1;
  if (price >= 5) return 0.5;
  if (price >= 1.2) return 0.05;
  return 0.005;
}

function buildMargin(
  range: { high: number; low: number; eq: number },
  last: number,
  liq: LiquidityPool[],
): MarginMap {
  const width = range.high - range.low || 1;
  const upper: MarginBand = {
    side: "upper",
    top: range.high,
    bottom: range.high - width * 0.21,
    active: last >= range.high - width * 0.21,
    name: "Верхняя маржа",
    hint: "Топливо крупняка: стопы лонгов и маржин-коллы выше хая. Сначала часто выносят маржу, потом отдают.",
  };
  const lower: MarginBand = {
    side: "lower",
    top: range.low + width * 0.21,
    bottom: range.low,
    active: last <= range.low + width * 0.21,
    name: "Нижняя маржа",
    hint: "Топливо крупняка: стопы шортов и маржин-коллы ниже лоя. Сначала часто выносят маржу, потом набирают.",
  };
  const where: MarginMap["where"] = upper.active ? "upper" : lower.active ? "lower" : "inside";
  const step = roundStep(last);
  const magnets: MarginMagnet[] = [];
  const from = range.low - step;
  const to = range.high + step;
  const start = Math.ceil(from / step) * step;
  for (let p = start; p <= to + step * 0.01; p = +(p + step).toFixed(8)) {
    const inBand = (p >= lower.bottom && p <= lower.top) || (p >= upper.bottom && p <= upper.top);
    if (!inBand) continue;
    magnets.push({ price: p, kind: "round", name: "круглый" });
    if (magnets.filter((m) => m.kind === "round").length >= 4) break;
  }
  for (const p of liq.filter((l) => l.equal).slice(-4)) {
    magnets.push({
      price: p.price,
      kind: p.side === "sell" ? "eqh" : "eql",
      name: p.side === "sell" ? "равные макс." : "равные мин.",
    });
  }
  return { upper, lower, magnets: magnets.slice(0, 6), where };
}

function fmt(n: number): string {
  const abs = Math.abs(n);
  const digits = abs >= 1000 ? 1 : abs >= 50 ? 2 : abs >= 1 ? 4 : 5;
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function buildStory(
  last: Candle,
  trend: "up" | "down" | "range",
  bias: Bias,
  pd: SmcSnapshot["premiumDiscount"],
  events: StructureEvent[],
  fvgs: Zone[],
  obs: Zone[],
  liq: LiquidityPool[],
  divergences: Divergence[],
  range: { high: number; low: number; eq: number },
  vp: { poc: number; vah: number; val: number },
  options: OptionsSnapshot | null,
  setup: LocalSetup,
  kz: { name: string; active: boolean }[],
  margin: MarginMap,
  patterns: PatternHit[],
  wyckoff: WyckoffRead,
  flow: FlowSnap,
  clusters: ClusterMap,
  micro: MicroSnap,
  fuel: SweepFuel | null = null,
): MarketStory {
  const chain: StoryBeat[] = [];
  const lastEv = events.at(-1);

  if (trend === "up") {
    chain.push({
      because:
        lastEv?.kind === "CHoCH"
          ? `Рынок сломал падение (смена характера) около ${fmt(lastEv.price)}`
          : lastEv
            ? `Последний слом структуры был вверх, около ${fmt(lastEv.price)}`
            : "Цена рисует более высокие максимумы и минимумы",
      therefore: "Покупатели задают направление. Продавать середину диапазона — идти против структуры.",
    });
  } else if (trend === "down") {
    chain.push({
      because:
        lastEv?.kind === "CHoCH"
          ? `Рынок сломал рост (смена характера) около ${fmt(lastEv.price)}`
          : lastEv
            ? `Последний слом структуры был вниз, около ${fmt(lastEv.price)}`
            : "Цена рисует более низкие максимумы и минимумы",
      therefore: "Продавцы задают направление. Покупать середину — против структуры.",
    });
  } else {
    chain.push({
      because: "Нет чистой серии выше-максимумов или ниже-минимумов",
      therefore: "Это диапазон. Решения принимаются у краёв, середина — шум.",
    });
  }

  if (pd === "discount") {
    chain.push({
      because: `Цена ${fmt(last.close)} ниже середины диапазона ${fmt(range.eq)}`,
      therefore:
        trend === "up"
          ? "Это «дешёвая» зона бычьего рынка: логичнее искать покупку от реакции, а не догонять."
          : "Цена дешёвая относительно диапазона, но тренд ещё не бычий — одного дисконта мало для лонга.",
    });
  } else if (pd === "premium") {
    chain.push({
      because: `Цена ${fmt(last.close)} выше середины диапазона ${fmt(range.eq)}`,
      therefore:
        trend === "down"
          ? "Это «дорогая» зона медвежьего рынка: логичнее искать продажу от реакции."
          : "Покупки здесь уже дорогие. Продолжение вверх возможно, но запас хода к потолку меньше.",
    });
  } else {
    chain.push({
      because: `Цена около равновесия ${fmt(range.eq)}`,
      therefore: "Рынок не выбрал сторону диапазона. Ждём выход или возврат от края.",
    });
  }

  if (margin.where !== "inside") {
    const band = margin.where === "upper" ? margin.upper : margin.lower;
    chain.push({
      because: `Цена в ${band.name.toLowerCase()} диапазона ${fmt(range.low)}–${fmt(range.high)} (${fmt(band.bottom)}–${fmt(band.top)})`,
      therefore:
        margin.where === "upper"
          ? "Маржа — то же топливо, что стопы. Догонять лонг здесь = кормить вынос. Ждём съём хая или возврат из маржи."
          : "Маржа — то же топливо, что стопы. Шортить здесь = стоять в чужих маржин-коллах. Ждём вынос лоя или возврат.",
    });
  }

  if (wyckoff.event !== "none" || wyckoff.phase === "accumulation" || wyckoff.phase === "distribution") {
    chain.push({ because: wyckoff.because, therefore: wyckoff.therefore });
  }
  const pat = patterns[0];
  if (pat) {
    chain.push({ because: `${pat.name}: ${pat.because}`, therefore: pat.therefore });
  }
  if (flow.cvdDiv) {
    chain.push({ because: flow.cvdDiv.because, therefore: flow.cvdDiv.therefore });
  } else if (flow.events[0]) {
    chain.push({ because: flow.events[0].because, therefore: flow.events[0].therefore });
  }
  chain.push({ because: clusters.because, therefore: clusters.therefore });
  chain.push({ because: micro.because, therefore: micro.therefore });
  if (micro.infusion) chain.push({ because: micro.infusion.because, therefore: micro.infusion.therefore });
  if (micro.splash) chain.push({ because: micro.splash.because, therefore: micro.splash.therefore });
  if (fuel) chain.push({ because: fuel.because, therefore: fuel.therefore });
  if (setup.targets[0] != null && /infusion|HVN|кластер/i.test(setup.thesis)) {
    chain.push({
      because: `Первая цель ${fmt(setup.targets[0])} — узел infusion по ходу: там объём уже тормозил цену`,
      therefore: "Тейк в остановку, не через неё. Сплэш в эту зону — часто добивание стопов перед паузой, не новая цель.",
    });
  }

  const swept = liq.find((l) => l.swept);
  if (swept) {
    chain.push({
      because:
        swept.side === "buy"
          ? `Сняли стопы над максимумами около ${fmt(swept.price)} и закрылись ниже`
          : `Сняли стопы под минимумами около ${fmt(swept.price)} и закрылись выше`,
      therefore: "Частый сценарий ложного пробоя: сначала вынос ликвидности, потом ход в другую сторону.",
    });
  }

  const nearFvg = fvgs.find((z) => {
    const pad = Math.max(z.top - z.bottom, last.close * 0.001) * 0.4;
    return last.close <= z.top + pad && last.close >= z.bottom - pad;
  });
  const nearOb = obs.find((z) => last.close <= z.top && last.close >= z.bottom);
  if (nearOb) {
    chain.push({
      because: `Цена стоит в ${zoneName(nearOb)} ${fmt(nearOb.bottom)}–${fmt(nearOb.top)}`,
      therefore:
        nearOb.kind === "breaker"
          ? nearOb.side === "bull"
            ? "Старый блок продаж сломали вверх. Брейкер — поддержка: крупняк часто защищает слом, не старый шорт."
            : "Старый блок покупок сломали вниз. Брейкер — сопротивление. Возврат сюда — типичная продажа ICT, не «откуп дна»."
          : nearOb.kind === "mitigation"
            ? "Первый возврат в блок: незакрытые ордера. Это вход, не «блок уже отработал — пропустить»."
            : nearOb.side === "bull"
          ? "Здесь покупатели раньше входили импульсом. Реакция вверх подтвердит, что блок жив."
          : "Здесь продавцы раньше входили импульсом. Реакция вниз подтвердит, что блок жив.",
    });
  } else if (nearFvg) {
    chain.push({
      because: `Цена в незакрытом импульсном разрыве ${fmt(nearFvg.bottom)}–${fmt(nearFvg.top)}`,
      therefore:
        "Рынок часто возвращается закрыть такой разрыв. Реакция от зоны важнее самой зоны.",
    });
  }

  if (divergences[0]) {
    chain.push({
      because:
        divergences[0].side === "bear"
          ? "Цена обновила максимум, а сила движения (RSI) — нет"
          : "Цена обновила минимум, а сила падения (RSI) — нет",
      therefore:
        divergences[0].side === "bear"
          ? "Импульс вверх выдыхается. Тренд может жить, но растёт шанс отката."
          : "Продавцы слабеют. Возможен отскок, если структура вниз не продолжится.",
    });
  }

  const magnet = options?.magnetStrikes[0];
  if (magnet != null && options) {
    const dist = Math.abs(last.close - magnet) / last.close;
    chain.push({
      because: `В опционах наибольший открытый интерес около ${fmt(magnet)}`,
      therefore:
        dist < 0.02
          ? "Цена уже у этого магнита — возможен застой или резкий выход после экспирации."
          : `Это притяжение, не приказ. ${fmt(magnet)} может тянуть цену, но не обязан исполняться.`,
    });
  }

  const pocDist = Math.abs(last.close - vp.poc);
  if (pocDist > (range.high - range.low) * 0.15) {
    chain.push({
      because: `Основной объём торгов (POC) лежит около ${fmt(vp.poc)}, далеко от цены`,
      therefore: "Справедливая цена по объёму ниже/выше текущей. Возврат к POC — один из магнитов, не вход сам по себе.",
    });
  }

  const session = kz.find((z) => z.active);
  const now =
    bias === "bullish"
      ? `Сейчас бычий контроль: цена ${fmt(last.close)} в ${pd === "discount" ? "дисконте" : pd === "premium" ? "премии" : "середине"} диапазона ${fmt(range.low)}–${fmt(range.high)}${session ? `, окно ${session.name}` : ""}.`
      : bias === "bearish"
        ? `Сейчас медвежий контроль: цена ${fmt(last.close)} в ${pd === "premium" ? "премии" : pd === "discount" ? "дисконте" : "середине"} диапазона ${fmt(range.low)}–${fmt(range.high)}${session ? `, окно ${session.name}` : ""}.`
        : `Сейчас нет выбранной стороны. Цена ${fmt(last.close)} внутри диапазона ${fmt(range.low)}–${fmt(range.high)}.`;

  const means =
    setup.entry != null
      ? `Рабочий сценарий — ждать реакцию у ${fmt(setup.entry)}, а не догонять текущую цену.`
      : "Рабочий сценарий — ждать свип края диапазона и смену характера. Середина не торгуется.";

  const ifHolds =
    setup.entry != null && setup.targets[0] != null
      ? `Если зона ${fmt(setup.entry)} устоит — логичная цель ${fmt(setup.targets[0])}${setup.targets[1] != null ? `, затем ${fmt(setup.targets[1])}` : ""}.`
      : `Если вынесут край и закроются обратно внутрь — появится направление.`;

  const ifBreaks =
    setup.stop != null
      ? `Если закроются за ${fmt(setup.stop)} — этот сценарий снимается, структура уже другая.`
      : setup.invalidation;

  const sweptNow = liq.find((l) => l.swept);
  const doing =
    trend === "up"
      ? `Крупный игрок уже держит бычью структуру${lastEv ? ` после слома около ${fmt(lastEv.price)}` : ""}. Он не гонится за ценой ${fmt(last.close)} — набор идёт в дисконте, у нижней половины диапазона ${fmt(range.low)}–${fmt(range.eq)}.${sweptNow ? " Стопы ритейла уже сняли: это типичный вход крупняка после выноса." : ""}`
      : trend === "down"
        ? `Крупный игрок держит медвежью структуру${lastEv ? ` после слома около ${fmt(lastEv.price)}` : ""}. Он продаёт из премии, не из дешёвой зоны. Текущая цена ${fmt(last.close)} — не место для ловли дна, пока не принесут в верхнюю половину ${fmt(range.eq)}–${fmt(range.high)}.`
        : `Крупный игрок сторону ещё не выбрал. Диапазон ${fmt(range.low)}–${fmt(range.high)}, середина ${fmt(range.eq)} — шум. Он ждёт вынос края и только потом смещение.`;

  const waiting =
    setup.entry != null
      ? `Чего ждёт: чтобы цену принесли в его зону около ${fmt(setup.entry)} и там появилась реакция. Не вход по рынку.`
      : `Чего ждёт: край коробки по вектору ликвидности. Середина — не вход, только направление.`;

  const leadsTo =
    `${ifHolds} ${ifBreaks} Это не приказ рынку, а карта: жив сценарий только пока структура не сломана.`;

  return { now, chain: chain.slice(0, 6), means, ifHolds, ifBreaks, doing, waiting, leadsTo };
}

export interface AnalyzeOpts {
  swing?: number;
  chochClose?: boolean;
  symbol?: string;
  kind?: MarketKind;
  dxyChange?: number | null;
  yieldChange?: number | null;
  oilChange?: number | null;
  halt?: NewsHalt | null;
}

export function analyzeMarket(
  candles: Candle[],
  options: OptionsSnapshot | null,
  trades?: { price: number; qty: number; buy: boolean }[],
  opts?: AnalyzeOpts,
): SmcSnapshot {
  const last = candles[candles.length - 1]!;
  const prev = candles[candles.length - 2] ?? last;
  const atr = avgTrueRange(candles);
  const n = Math.min(5, Math.max(2, opts?.swing ?? SWING));
  const swings = findSwings(candles, n, n);
  const { trend, events } = detectStructure(candles, swings, Boolean(opts?.chochClose));
  const fvgs = detectFvgs(candles);
  const orderBlocks = detectOrderBlocks(candles, events);
  const liquidity = detectLiquidity(candles, swings, atr);
  const divergences = detectDivergence(candles, swings);
  const waves = detectWaves(swings);
  const patterns = detectPatterns(swings, atr, candles);
  let flow = buildFlow(candles, swings, atr);
  const clusters = (trades?.length ? clustersFromTrades(trades) : null) ?? clustersFromCandles(candles);
  const micro = buildMicro(
    candles,
    opts?.symbol ? liveClusters(opts.symbol) : [],
    opts?.symbol ? liveAskBid(opts.symbol) : null,
  );
  const sweepFuel = buildSweepFuel(candles, liquidity, micro.nodes, atr, last.close);
  const auction = buildAuction(candles, opts?.kind);
  const coil = buildCoilBreak(candles, atr, swings);
  const corr = buildCorr(opts?.symbol ?? "", {
    dxyChange: opts?.dxyChange,
    yieldChange: opts?.yieldChange,
    oilChange: opts?.oilChange,
  });
  const ivNews = buildIvNews(opts?.halt, options);
  const tapeProf = opts?.symbol ? liveProfile(opts.symbol) : null;
  const tapeAb = opts?.symbol ? liveAskBid(opts.symbol) : null;
  const tapeBook = opts?.symbol ? brokerBook(opts.symbol) : null;
  const tapeFlow = opts?.symbol ? liveCdFlow(opts.symbol) : null;
  const tapeNodes = opts?.symbol ? liveClusters(opts.symbol) : [];
  const cdTape = {
    live: Boolean(tapeNodes.length || tapeProf || tapeAb || tapeBook || tapeFlow || (opts?.symbol ? liveCdBars(opts.symbol).length : 0)),
    ask: tapeAb?.ask ?? null,
    bid: tapeAb?.bid ?? null,
    volume: tapeFlow?.volume ?? null,
    delta: tapeFlow?.delta ?? null,
    splash: tapeNodes.some((n) => n.kind === "splash"),
    infusion: tapeNodes.some((n) => n.kind === "infusion"),
    book: tapeBook ? [...tapeBook.bids, ...tapeBook.asks].slice(0, 12) : [],
    bars: opts?.symbol ? liveCdBars(opts.symbol) : [],
  };
  const src = candles.slice(-64);
  const dpocPath: { time: number; price: number }[] = [];
  for (let i = 4; i < src.length; i++) {
    dpocPath.push({ time: src[i]!.time, price: volumeProfile(src.slice(0, i + 1), 16).poc });
  }
  const developed = dpocPath.at(-1)?.price ?? volumeProfile(src.slice(-16), 18).poc;
  const vp = {
    poc: tapeProf?.poc ?? clusters.poc,
    dpoc: developed,
    dpocPath,
    vah: tapeProf?.vah ?? clusters.vah,
    val: tapeProf?.val ?? clusters.val,
    bins: clusters.bins.map((b) => ({ price: b.price, volume: b.volume })),
  };
  const swingHighs = swings.filter((s) => s.type === "high");
  const swingLows = swings.filter((s) => s.type === "low");
  const rangeHigh = swingHighs.at(-1)?.price ?? last.high;
  const rangeLow = swingLows.at(-1)?.price ?? last.low;
  const eq = (rangeHigh + rangeLow) / 2;
  const pos = (last.close - rangeLow) / (rangeHigh - rangeLow || 1);
  const premiumDiscount: SmcSnapshot["premiumDiscount"] =
    pos > 0.55 ? "premium" : pos < 0.45 ? "discount" : "equilibrium";
  const ote =
    trend === "down"
      ? {
          high: rangeHigh - (rangeHigh - rangeLow) * 0.62,
          low: rangeHigh - (rangeHigh - rangeLow) * 0.79,
        }
      : {
          high: rangeLow + (rangeHigh - rangeLow) * 0.79,
          low: rangeLow + (rangeHigh - rangeLow) * 0.62,
        };

  let bias: Bias = trend === "up" ? "bullish" : trend === "down" ? "bearish" : "range";
  if (trend === "up" && premiumDiscount === "premium" && divergences.some((d) => d.side === "bear")) {
    bias = "range";
  }
  if (trend === "down" && premiumDiscount === "discount" && divergences.some((d) => d.side === "bull")) {
    bias = "range";
  }

  const confluence: ConfluenceItem[] = [];
  confluence.push({
    id: "structure",
    layer: "Структура",
    status: trend === "up" ? "for" : trend === "down" ? "against" : "neutral",
    note:
      trend === "up"
        ? "HH/HL, последние события — бычий BOS/CHoCH."
        : trend === "down"
          ? "LH/LL, структура медвежья."
          : "Нет чистого смещения.",
  });
  confluence.push({
    id: "pd",
    layer: "Премия / дисконт",
    status:
      (trend === "up" && premiumDiscount !== "premium") ||
      (trend === "down" && premiumDiscount !== "discount")
        ? "for"
        : "against",
    note:
      premiumDiscount === "discount"
        ? "Цена в дисконте dealing range."
        : premiumDiscount === "premium"
          ? "Цена в премии."
          : "Около равновесия (50%).",
  });
  const nearFvg = fvgs.some(
    (z) => last.close <= z.top + atr * 0.2 && last.close >= z.bottom - atr * 0.2,
  );
  confluence.push({
    id: "fvg",
    layer: "FVG",
    status: nearFvg ? "for" : fvgs.length ? "neutral" : "against",
    note: nearFvg
      ? "Цена касается незакрытого имбаланса."
      : fvgs.length
        ? `${fvgs.length} открытых FVG на графике.`
        : "Открытых FVG нет.",
  });
  confluence.push({
    id: "vol",
    layer: "Объём",
    status:
      Math.abs(last.close - vp.poc) < atr
        ? "for"
        : last.close > vp.vah || last.close < vp.val
          ? "neutral"
          : "neutral",
    note: `POC ${vp.poc.toFixed(2)}. Value area ${vp.val.toFixed(2)}–${vp.vah.toFixed(2)}.`,
  });
  confluence.push({
    id: "div",
    layer: "Дивергенция",
    status: divergences.length
      ? divergences[0]!.side === "bull"
        ? "for"
        : "against"
      : "neutral",
    note: divergences[0]?.note ?? "Регулярной дивергенции RSI на последних свингах нет.",
  });
  if (options) {
    const magnet = options.magnetStrikes[0];
    const pc = options.putCall;
    const near = magnet != null && Math.abs(options.spot - magnet) / options.spot < 0.03;
    confluence.push({
      id: "opt",
      layer: "Опционы",
      status: pc != null && pc > 1.15 ? "against" : pc != null && pc < 0.7 ? "for" : near ? "for" : "neutral",
      note: magnet
        ? `${options.currency}: магнит OI ${magnet}. P/C ${pc?.toFixed(2) ?? "—"}. ${options.note}`
        : options.note,
    });
  } else {
    confluence.push({
      id: "opt",
      layer: "Опционы",
      status: "neutral",
      note: "Цепочка недоступна для этого рынка.",
    });
  }
  const kz = killzones(last.time);
  confluence.push({
    id: "kz",
    layer: "Сессия",
    status: kz.some((z) => z.active) ? "for" : "neutral",
    note: kz.find((z) => z.active)?.name
      ? `Активна ${kz.find((z) => z.active)!.name}.`
      : "Вне ключевых окон ICT.",
  });

  const dealingRange = { high: rangeHigh, low: rangeLow, eq };
  flow = locateEdgeDiv(flow, premiumDiscount, last.close, dealingRange, fvgs, liquidity, atr);
  const boxVector = buildBoxVector(last, dealingRange, liquidity, candles);
  const margin = buildMargin(dealingRange, last.close, liquidity);
  const wyckoff = detectWyckoff(candles, swings, liquidity, dealingRange, trend);
  const marginAligned =
    (margin.where === "lower" && (trend === "up" || bias === "bullish")) ||
    (margin.where === "upper" && (trend === "down" || bias === "bearish"));
  confluence.push({
    id: "margin",
    layer: "Маржа 21%",
    status:
      margin.where === "inside"
        ? "neutral"
        : marginAligned
          ? "for"
          : "against",
    note:
      margin.where === "upper"
        ? `${margin.upper.name}: ${margin.upper.hint}${marginAligned ? " Край 21% в нашу сторону — доп. очки (как рабочая зона WS), вход всё равно от блока/FVG." : " Край против нас — очки не даю, догонять маржу нельзя."}`
        : margin.where === "lower"
          ? `${margin.lower.name}: ${margin.lower.hint}${marginAligned ? " Край 21% в нашу сторону — доп. очки (как рабочая зона WS), вход всё равно от блока/FVG." : " Край против нас — очки не даю, догонять маржу нельзя."}`
          : "Цена внутри диапазона, не на марже. Плечи ещё не в критической зоне.",
  });
  const leadPat = patterns[0];
  confluence.push({
    id: "pattern",
    layer: leadPat ? (leadPat.family === "harmonic" ? "Гармоника" : "Паттерн") : "Паттерн",
    status: leadPat ? (leadPat.side === "bull" ? "for" : "against") : "neutral",
    note: leadPat ? `${leadPat.name}. ${leadPat.therefore}` : "Чистой графической или гармонической фигуры на последних свингах нет.",
  });
  confluence.push({
    id: "wyckoff",
    layer: "Вайкофф",
    status:
      wyckoff.event === "spring" || wyckoff.phase === "accumulation" || (wyckoff.phase === "markup" && wyckoff.event === "sos")
        ? "for"
        : wyckoff.event === "utad" || wyckoff.phase === "distribution"
          ? "against"
          : "neutral",
    note: `${wyckoff.name}. ${wyckoff.therefore}`,
  });
  const fe = flow.events[0];
  confluence.push({
    id: "flow",
    layer: "Дельта / HFT",
    status:
      flow.cvdDiv?.where === "edge"
        ? flow.cvdDiv.side === "bull"
          ? "for"
          : "against"
        : flow.cvdDiv?.where === "mid"
          ? "neutral"
          : fe
            ? fe.side === "bull"
              ? "for"
              : "against"
            : "neutral",
    note: flow.cvdDiv
      ? flow.cvdDiv.therefore
      : fe
        ? `${fe.kind === "absorption" ? "Поглощение" : fe.kind === "hft-burst" ? "HFT-всплеск" : fe.kind === "exhaustion" ? "Истощение" : "Кульминация"}. ${fe.therefore}`
        : `CVD ${flow.cvdSlope === "up" ? "растёт" : flow.cvdSlope === "down" ? "падает" : "боковик"} (${flow.source === "tape" ? "лента" : "оценка по свече"}).`,
  });
  confluence.push({
    id: "cluster",
    layer: "Кластер",
    status: clusters.stacked[0] ? (clusters.stacked[0].side === "buy" ? "for" : "against") : "neutral",
    note: `${clusters.source === "trades" ? "Лента сделок. " : "Профиль по свечам. "}${clusters.therefore}`,
  });
  confluence.push({
    id: "vwap",
    layer: "VWAP",
    status: micro.where === "inside" ? "neutral" : micro.where === "below" && trend === "up" ? "for" : micro.where === "above" && trend === "down" ? "for" : "against",
    note: micro.therefore,
  });
  const brk = orderBlocks.filter((z) => z.kind === "breaker");
  const mit = orderBlocks.filter((z) => z.kind === "mitigation");
  confluence.push({
    id: "breaker",
    layer: "Брейкер / митигейшн",
    status: brk[0] ? (brk[0].side === "bull" ? "for" : "against") : mit[0] ? "for" : "neutral",
    note: brk[0]
      ? `${zoneName(brk[0])} ${fmt(brk[0].bottom)}–${fmt(brk[0].top)}. Слом блока → зона в другую сторону.`
      : mit[0]
        ? `${zoneName(mit[0])}: первый возврат в блок — рабочая зона ICT, не мёртвая.`
        : "Свежего брейкера нет. Обычный блок или FVG.",
  });
  confluence.push({
    id: "foot",
    layer: "Футпринт",
    status:
      micro.splash?.side === "buy" || micro.infusion?.side === "buy"
        ? "for"
        : micro.splash?.side === "sell" || micro.infusion?.side === "sell"
          ? "against"
          : micro.footprint.delta > 0
            ? "for"
            : micro.footprint.delta < 0
              ? "against"
              : "neutral",
    note: `${micro.because}${micro.infusion ? ` ${micro.infusion.because}` : ""}${micro.splash ? ` ${micro.splash.because}` : ""}`,
  });
  confluence.push({
    id: "auction",
    layer: "IB / ORB",
    status:
      auction.orb === "failed-high" || auction.orb === "broke-low"
        ? "against"
        : auction.orb === "failed-low" || auction.orb === "broke-high"
          ? "for"
          : "neutral",
    note: `${auction.because} ${auction.therefore}`,
  });
  confluence.push({
    id: "coil",
    layer: "Полка / шпиль",
    status:
      coil.kind === "coil"
        ? coil.dir === "up"
          ? "for"
          : coil.dir === "down"
            ? "against"
            : "neutral"
        : coil.kind === "spike"
          ? "against"
          : "neutral",
    note: `${coil.because} ${coil.therefore}`,
  });
  if (sweepFuel) {
    confluence.push({
      id: "fuel",
      layer: "Топливо съёма",
      status: sweepFuel.grade === "strong" ? "for" : sweepFuel.grade === "weak" ? "against" : "neutral",
      note: `${sweepFuel.because} ${sweepFuel.therefore}`,
    });
  }
  confluence.push({
    id: "box",
    layer: "Вектор коробки",
    status: boxVector.dir === "up" ? "for" : boxVector.dir === "down" ? "against" : "neutral",
    note: boxVector.because,
  });
  confluence.push({
    id: "corr",
    layer: "Корреляция",
    status: corr.status,
    note: corr.note,
  });
  confluence.push({
    id: "iv",
    layer: "IV / гамма",
    status: ivNews.phase === "crush" || ivNews.phase === "elevated" ? "against" : ivNews.phase === "building" ? "neutral" : "neutral",
    note: `${ivNews.because} ${ivNews.therefore}`,
  });

  const forCount = confluence.filter((c) => c.status === "for").length;
  const againstCount = confluence.filter((c) => c.status === "against").length;
  const score = Math.min(
    100,
    Math.round(
      (100 * (forCount + 0.45 * (confluence.length - forCount - againstCount))) /
        Math.max(confluence.length, 1),
    ) +
      (flow.cvdDiv?.where === "edge" ? flow.cvdDiv.boost : 0) +
      (marginAligned ? 8 : 0),
  );

  const localSetup = buildSetup(
    last,
    trend,
    premiumDiscount,
    fvgs,
    orderBlocks,
    liquidity,
    dealingRange,
    atr,
    micro,
    clusters.hvn,
  );
  const story = buildStory(
    last,
    trend,
    bias,
    premiumDiscount,
    events,
    fvgs,
    orderBlocks,
    liquidity,
    divergences,
    dealingRange,
    { poc: vp.poc, vah: vp.vah, val: vp.val },
    options,
    localSetup,
    kz,
    margin,
    patterns,
    wyckoff,
    flow,
    clusters,
    micro,
    sweepFuel,
  );

  if (cdTape.live) {
    story.chain.unshift({
      because: `ClusterDelta с терминала${cdTape.ask != null ? `: Ask ${Math.round(cdTape.ask)} Bid ${Math.round(cdTape.bid ?? 0)}` : ""}${tapeProf ? `, POC ${tapeProf.poc}` : ""}.`,
      therefore:
        "На графике: вливание — остановка/цель, сплэш — вынос, дисбаланс — перекос Ask/Bid. Полоски справа — BookMap (стакан), не вся теплокарта футпринта.",
    });
  }

  return {
    bias,
    trend,
    lastClose: last.close,
    lastChangePct: ((last.close - prev.close) / prev.close) * 100,
    atr,
    dealingRange,
    premiumDiscount,
    ote,
    swings: swings.slice(-16),
    events: events.slice(-10),
    orderBlocks,
    fvgs,
    liquidity,
    margin,
    volumeProfile: vp,
    divergences,
    waves,
    patterns,
    wyckoff,
    flow,
    clusters,
    micro,
    sweepFuel,
    cdTape,
    auction,
    coil,
    boxVector,
    corr,
    ivNews,
    killzone: kz,
    confluence,
    score,
    localSetup,
    story,
  };
}

export function compactForAi(symbol: string, timeframe: string, snap: SmcSnapshot) {
  return {
    symbol,
    timeframe,
    bias: snap.bias,
    trend: snap.trend,
    lastClose: snap.lastClose,
    changePct: snap.lastChangePct,
    atr: snap.atr,
    premiumDiscount: snap.premiumDiscount,
    dealingRange: snap.dealingRange,
    ote: snap.ote,
    events: snap.events.slice(-6),
    orderBlocks: snap.orderBlocks.slice(-4).map(({ id: _id, ...z }) => z),
    fvgs: snap.fvgs.slice(-4).map(({ id: _id, ...z }) => z),
    liquidity: snap.liquidity.slice(-6),
    margin: snap.margin,
    volumeProfile: {
      poc: snap.volumeProfile.poc,
      dpoc: snap.volumeProfile.dpoc,
      vah: snap.volumeProfile.vah,
      val: snap.volumeProfile.val,
    },
    divergences: snap.divergences,
    waves: snap.waves,
    patterns: snap.patterns,
    wyckoff: snap.wyckoff,
    flow: {
      lastDelta: snap.flow.lastDelta,
      cvd: snap.flow.cvd,
      cvdSlope: snap.flow.cvdSlope,
      source: snap.flow.source,
      cvdDiv: snap.flow.cvdDiv,
      events: snap.flow.events,
    },
    clusters: {
      poc: snap.clusters.poc,
      stacked: snap.clusters.stacked,
      unfinished: snap.clusters.unfinished,
      source: snap.clusters.source,
      because: snap.clusters.because,
      therefore: snap.clusters.therefore,
    },
    micro: {
      vwap: snap.micro.vwap,
      where: snap.micro.where,
      footprint: snap.micro.footprint,
      infusion: snap.micro.infusion,
      splash: snap.micro.splash,
      nodes: snap.micro.nodes.filter((n) => n.kind === "infusion" || n.kind === "imbalance").slice(-8),
      cmeTicker: snap.micro.cmeTicker,
      therefore: snap.micro.therefore,
    },
    sweepFuel: snap.sweepFuel,
    cdTape: snap.cdTape,
    auction: snap.auction,
    coil: snap.coil,
    boxVector: snap.boxVector,
    corr: snap.corr,
    ivNews: snap.ivNews,
    confluence: snap.confluence,
    localSetup: snap.localSetup,
    story: snap.story,
    score: snap.score,
  };
}

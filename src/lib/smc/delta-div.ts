import type { Candle } from "@/lib/market/types";
import { deltaOf } from "@/lib/smc/flow";

export type DivHit = {
  a: { time: number; price: number };
  b: { time: number; price: number };
  bull: boolean;
  onHigh: boolean;
};

export function deltaDivergenceOn(candles: Candle[]): DivHit | null {
  if (candles.length < 12) return null;
  const delta: number[] = [];
  const cvd: number[] = [];
  let acc = 0;
  for (const c of candles) {
    const d = deltaOf(c);
    delta.push(d);
    acc += d;
    cvd.push(acc);
  }
  const highs = pivots(
    candles.map((c) => c.high),
    "high",
  );
  const lows = pivots(
    candles.map((c) => c.low),
    "low",
  );
  const fromHighs = pair(candles, highs, cvd, delta, true);
  const fromLows = pair(candles, lows, cvd, delta, false);
  if (fromHighs && fromLows) return fromHighs.b.time >= fromLows.b.time ? fromHighs : fromLows;
  return fromHighs ?? fromLows;
}

function pair(candles: Candle[], pts: number[], cvd: number[], delta: number[], onHigh: boolean): DivHit | null {
  for (let i = pts.length - 1; i >= 1; i--) {
    const b = pts[i]!;
    for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
      const a = pts[j]!;
      if (b - a < 4) continue;
      const left = onHigh ? candles[a]!.high : candles[a]!.low;
      const right = onHigh ? candles[b]!.high : candles[b]!.low;
      const push = leg(delta, a, b);
      if (onHigh && right > left && (cvd[b]! < cvd[a]! || push < 0)) return ends(candles, a, b, false, true);
      if (onHigh && right < left && (cvd[b]! > cvd[a]! || push > 0)) return ends(candles, a, b, true, true);
      if (!onHigh && right < left && (cvd[b]! > cvd[a]! || push > 0)) return ends(candles, a, b, true, false);
      if (!onHigh && right > left && (cvd[b]! < cvd[a]! || push < 0)) return ends(candles, a, b, false, false);
    }
  }
  return null;
}

function leg(delta: number[], from: number, to: number) {
  let sum = 0;
  const start = Math.max(from, to - 6);
  for (let i = start; i <= to; i++) sum += delta[i] ?? 0;
  return sum;
}

function ends(candles: Candle[], a: number, b: number, bull: boolean, onHigh: boolean): DivHit {
  const left = candles[a]!;
  const right = candles[b]!;
  return {
    bull,
    onHigh,
    a: { time: left.time, price: onHigh ? left.high : left.low },
    b: { time: right.time, price: onHigh ? right.high : right.low },
  };
}

function pivots(values: number[], kind: "high" | "low") {
  const out: number[] = [];
  const span = 4;
  for (let i = span; i < values.length - span; i++) {
    let ok = true;
    for (let k = 1; k <= span; k++) {
      if (kind === "high" && !(values[i]! >= values[i - k]! && values[i]! > values[i + k]!)) ok = false;
      if (kind === "low" && !(values[i]! <= values[i - k]! && values[i]! < values[i + k]!)) ok = false;
    }
    if (ok) out.push(i);
  }
  return out;
}

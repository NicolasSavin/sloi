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
  const cvd: number[] = [];
  let acc = 0;
  for (const c of candles) {
    acc += deltaOf(c);
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
  for (let i = highs.length - 1; i >= 1; i--) {
    const a = highs[i - 1]!;
    const b = highs[i]!;
    if (candles[b]!.high > candles[a]!.high && cvd[b]! < cvd[a]!) return ends(candles, a, b, false, true);
    if (candles[b]!.high < candles[a]!.high && cvd[b]! > cvd[a]!) return ends(candles, a, b, true, true);
  }
  for (let i = lows.length - 1; i >= 1; i--) {
    const a = lows[i - 1]!;
    const b = lows[i]!;
    if (candles[b]!.low < candles[a]!.low && cvd[b]! > cvd[a]!) return ends(candles, a, b, true, false);
    if (candles[b]!.low > candles[a]!.low && cvd[b]! < cvd[a]!) return ends(candles, a, b, false, false);
  }
  return null;
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
  const span = 2;
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

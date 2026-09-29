import type { Candle } from "@/lib/market/types";

const LEFT = 4;
const RIGHT = 4;

export interface LevelTouch {
  from: "below" | "above";
  reactionPips: number;
  reactionAtr: number;
}

export interface MemLevel {
  price: number;
  born: number;
  origin: "impulse" | "swing";
  touches: LevelTouch[];
}

export interface ReactionSample {
  kind: "retest" | "baseline" | "empty" | "near-impulse";
  origin: "impulse" | "swing" | "none";
  touch: number;
  hit: boolean;
  pips: number;
  atrUnits: number;
}

export interface LiveReaction {
  kind: "retest" | "empty-impulse" | "none";
  price: number | null;
  origin: "impulse" | "swing" | null;
  tests: number;
  priorPips: number[];
  expectedPips: number | null;
  approach: "below" | "above" | null;
  slowing: boolean;
  volumeUp: boolean;
  sweep: boolean;
  side: "long" | "short" | null;
  entry: number | null;
  stop: number | null;
  target: number | null;
  note: string;
}

function atr(candles: Candle[], i: number): number {
  const from = Math.max(1, i - 13);
  let sum = 0;
  let n = 0;
  for (let j = from; j <= i; j++) {
    const c = candles[j]!;
    const p = candles[j - 1]!;
    sum += Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
    n++;
  }
  return n > 0 ? sum / n : Math.max(candles[i]!.high - candles[i]!.low, 1e-8);
}

function race(
  candles: Candle[],
  i: number,
  level: number,
  from: "below" | "above",
  a: number,
  pip: number,
  horizon: number,
): { hit: boolean; pips: number } {
  const goal = a * 0.6;
  const stop = a * 0.25;
  let best = 0;
  const end = Math.min(candles.length - 1, i + horizon);
  for (let k = i + 1; k <= end; k++) {
    const c = candles[k]!;
    const adverse = from === "below" ? c.high - level : level - c.low;
    const favor = from === "below" ? level - c.low : c.high - level;
    best = Math.max(best, favor);
    if (adverse >= stop) return { hit: false, pips: best / pip };
    if (favor >= goal) return { hit: true, pips: goal / pip };
  }
  return { hit: false, pips: best / pip };
}

function nearest(levels: MemLevel[], price: number): { level: MemLevel; dist: number } | null {
  let best: { level: MemLevel; dist: number } | null = null;
  for (const level of levels) {
    const dist = Math.abs(price - level.price);
    if (!best || dist < best.dist) best = { level, dist };
  }
  return best;
}

function cameFromAway(candles: Candle[], i: number, price: number, minAway: number): boolean {
  let far = 0;
  for (let k = Math.max(0, i - 6); k < i; k++) {
    if (Math.abs(candles[k]!.close - price) >= minAway) far++;
  }
  return far >= 3;
}

/** Walk closed bars only. A pivot is stored after the right-hand bars exist, so the live bar is not a future leak. */
export function replayLevels(candles: Candle[], pip: number): { levels: MemLevel[]; samples: ReactionSample[]; live: LiveReaction } {
  const levels: MemLevel[] = [];
  const samples: ReactionSample[] = [];
  const last = candles.length - 1;
  for (let i = 20; i <= last; i++) {
    const a = atr(candles, i);
    const p = i - RIGHT;
    if (p >= LEFT) {
      const bar = candles[p]!;
      let high = true;
      let low = true;
      for (let k = p - LEFT; k <= p + RIGHT; k++) {
        if (k === p) continue;
        if (candles[k]!.high >= bar.high) high = false;
        if (candles[k]!.low <= bar.low) low = false;
      }
      if (high || low) {
        const price = high ? bar.high : bar.low;
        const back = candles[Math.max(0, p - 6)]!;
        const origin = Math.abs(bar.close - back.close) >= 1.6 * atr(candles, p) ? "impulse" : "swing";
        const hit = nearest(levels, price);
        if (hit && hit.dist <= a * 0.22) {
          hit.level.price = (hit.level.price * (1 + hit.level.touches.length) + price) / (2 + hit.level.touches.length);
        } else {
          levels.push({ price, born: i, origin, touches: [] });
        }
      }
    }

    const done = i <= last - 8;
    const near = nearest(levels, candles[i]!.close);
    if (done && near && near.level.born <= i - 8) {
      const dist = Math.min(
        Math.abs(candles[i]!.high - near.level.price),
        Math.abs(candles[i]!.low - near.level.price),
        Math.abs(candles[i]!.close - near.level.price),
      );
      if (dist <= a * 0.2 && cameFromAway(candles, i, near.level.price, a * 0.55)) {
        const from: "below" | "above" = candles[i - 1]!.close < near.level.price ? "below" : "above";
        const out = race(candles, i, near.level.price, from, a, pip, 8);
        near.level.touches.push({ from, reactionPips: out.pips, reactionAtr: a > 0 ? (out.pips * pip) / a : 0 });
        samples.push({
          kind: "retest",
          origin: near.level.origin,
          touch: near.level.touches.length,
          hit: out.hit,
          pips: out.pips,
          atrUnits: a > 0 ? (out.pips * pip) / a : 0,
        });
      }
    }

    if (done && (!near || near.dist > a * 1.1)) {
      const up = candles[i]!.close >= candles[i]!.open;
      const out = race(candles, i, candles[i]!.close, up ? "below" : "above", a, pip, 8);
      samples.push({
        kind: "baseline",
        origin: "none",
        touch: 0,
        hit: out.hit,
        pips: out.pips,
        atrUnits: a > 0 ? (out.pips * pip) / a : 0,
      });
    }

    const range = candles[i]!.high - candles[i]!.low;
    if (done && range >= a * 2) {
      const far = !near || near.dist > a * 1.2;
      const up = candles[i]!.close >= candles[i]!.open;
      const out = race(candles, i, candles[i]!.close, up ? "below" : "above", a, pip, 6);
      samples.push({
        kind: far ? "empty" : "near-impulse",
        origin: "none",
        touch: 0,
        hit: out.hit,
        pips: out.pips,
        atrUnits: a > 0 ? (out.pips * pip) / a : 0,
      });
    }
  }

  const live = readLive(candles, levels, pip);
  return { levels, samples, live };
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

function readLive(candles: Candle[], levels: MemLevel[], pip: number): LiveReaction {
  const none: LiveReaction = {
    kind: "none",
    price: null,
    origin: null,
    tests: 0,
    priorPips: [],
    expectedPips: null,
    approach: null,
    slowing: false,
    volumeUp: false,
    sweep: false,
    side: null,
    entry: null,
    stop: null,
    target: null,
    note: "У известного уровня цена сейчас не стоит.",
  };
  if (candles.length < 30) return none;
  const i = candles.length - 1;
  const a = atr(candles, i);
  const bar = candles[i]!;
  const prev = candles[i - 1]!;
  const near = nearest(levels, bar.close);
  const slowing = bar.high - bar.low < prev.high - prev.low;
  const vols = candles.slice(-21, -1).map((c) => c.volume);
  const med = [...vols].sort((x, y) => x - y)[Math.floor(vols.length / 2)] || 0;
  const volumeUp = med > 0 && bar.volume > med * 1.4;
  const dist = near ? Math.min(Math.abs(bar.high - near.level.price), Math.abs(bar.low - near.level.price), Math.abs(bar.close - near.level.price)) : Infinity;
  if (near && near.level.born <= i - 8 && dist <= a * 0.22 && cameFromAway(candles, i, near.level.price, a * 0.5)) {
    const approach: "below" | "above" = prev.close < near.level.price ? "below" : "above";
    const sweep =
      approach === "below"
        ? bar.high > near.level.price && bar.close < near.level.price
        : bar.low < near.level.price && bar.close > near.level.price;
    const prior = near.level.touches.map((t) => t.reactionPips).filter((n) => n > 0);
    const expected = median(prior);
    const side: "long" | "short" = approach === "below" ? "short" : "long";
    const entry = bar.close;
    const pad = Math.max(a * 0.25, pip * 2);
    const move = a * 0.6;
    const stop = side === "short" ? near.level.price + pad : near.level.price - pad;
    const target = side === "short" ? entry - move : entry + move;
    const quality = [slowing, volumeUp, sweep, prior.length > 0].filter(Boolean).length;
    return {
      kind: "retest",
      price: near.level.price,
      origin: near.level.origin,
      tests: near.level.touches.length,
      priorPips: prior.slice(-4),
      expectedPips: expected,
      approach,
      slowing,
      volumeUp,
      sweep,
      side: quality >= 2 ? side : null,
      entry: quality >= 2 ? entry : null,
      stop: quality >= 2 ? stop : null,
      target: quality >= 2 ? target : null,
      note: `Уровень ${near.level.price.toFixed(5)}, ${near.level.origin === "impulse" ? "остановка импульса" : "старый экстремум"}. Касаний с памятью: ${near.level.touches.length}. Подход ${approach === "below" ? "снизу" : "сверху"}. ${slowing ? "Свеча короче." : "Скорость не упала."} ${volumeUp ? "Объём выше обычного." : "Объём обычный."} ${sweep ? "Хвост снял уровень и закрылись обратно." : "Съёма нет."}`,
    };
  }
  const range = bar.high - bar.low;
  if (range >= a * 2 && (!near || near.dist > a * 1.2)) {
    return {
      ...none,
      kind: "empty-impulse",
      slowing,
      volumeUp,
      note: "Импульс на пустом месте: рядом нет уровня, у которого цена уже останавливалась. Короткий откат возможен, но вход против импульса сам по себе не ставится. Нужно, чтобы следующая свеча показала усталость.",
    };
  }
  return none;
}

export function summarize(samples: ReactionSample[]) {
  const pack = (rows: ReactionSample[]) => {
    const hits = rows.filter((r) => r.hit);
    const pips = rows.map((r) => r.pips).sort((a, b) => a - b);
    return {
      n: rows.length,
      hit: hits.length,
      rate: rows.length ? hits.length / rows.length : 0,
      medianPips: pips.length ? pips[Math.floor(pips.length / 2)]! : 0,
    };
  };
  return {
    retest: pack(samples.filter((s) => s.kind === "retest")),
    impulseOrigin: pack(samples.filter((s) => s.kind === "retest" && s.origin === "impulse")),
    swingOrigin: pack(samples.filter((s) => s.kind === "retest" && s.origin === "swing")),
    second: pack(samples.filter((s) => s.kind === "retest" && s.touch === 2)),
    third: pack(samples.filter((s) => s.kind === "retest" && s.touch >= 3)),
    baseline: pack(samples.filter((s) => s.kind === "baseline")),
    empty: pack(samples.filter((s) => s.kind === "empty")),
    nearImpulse: pack(samples.filter((s) => s.kind === "near-impulse")),
  };
}

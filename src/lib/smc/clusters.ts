import type { Candle } from "@/lib/market/types";
import { buyVolumeOf } from "@/lib/smc/flow";
import { barVolume } from "@/lib/smc/micro";

export interface ClusterBin {
  price: number;
  buy: number;
  sell: number;
  volume: number;
  imbalance: "buy" | "sell" | null;
}

export interface ClusterStack {
  side: "buy" | "sell";
  from: number;
  to: number;
}

export interface ClusterMap {
  bins: ClusterBin[];
  poc: number;
  vah: number;
  val: number;
  hvn: number[];
  lvn: number[];
  stacked: ClusterStack[];
  unfinished: "high" | "low" | "both" | null;
  source: "trades" | "profile" | "cme";
  because: string;
  therefore: string;
}

export interface TapeTrade {
  price: number;
  qty: number;
  buy: boolean;
}

const RATIO = 3;

function binsFrom(lo: number, hi: number, n = 28) {
  const span = hi - lo || 1;
  const step = span / n;
  return { lo, hi, span, step, n };
}

function finish(raw: { buy: number; sell: number }[], lo: number, span: number, n: number, source: ClusterMap["source"]): ClusterMap {
  const bins: ClusterBin[] = raw.map((b, i) => {
    const volume = b.buy + b.sell;
    const imbalance =
      b.buy >= b.sell * RATIO && b.buy > 0 ? "buy" : b.sell >= b.buy * RATIO && b.sell > 0 ? "sell" : null;
    return {
      price: lo + ((i + 0.5) / n) * span,
      buy: b.buy,
      sell: b.sell,
      volume,
      imbalance,
    };
  });
  const vols = bins.map((b) => b.volume);
  const total = vols.reduce((a, b) => a + b, 0) || 1;
  let pocIdx = 0;
  for (let i = 1; i < bins.length; i++) if (vols[i]! > vols[pocIdx]!) pocIdx = i;
  const sorted = [...vols].sort((a, b) => a - b);
  const hiCut = sorted[Math.floor(sorted.length * 0.78)] ?? 0;
  const loCut = sorted[Math.floor(sorted.length * 0.18)] ?? 0;
  const hvn = bins.filter((b) => b.volume >= hiCut && b.volume > 0).map((b) => b.price);
  const lvn = bins.filter((b) => b.volume <= loCut).map((b) => b.price);
  let acc = vols[pocIdx]!;
  let loIdx = pocIdx;
  let hiIdx = pocIdx;
  const target = total * 0.7;
  while (acc < target && (loIdx > 0 || hiIdx < n - 1)) {
    const down = loIdx > 0 ? vols[loIdx - 1]! : -1;
    const up = hiIdx < n - 1 ? vols[hiIdx + 1]! : -1;
    if (up >= down) {
      hiIdx += 1;
      acc += vols[hiIdx]!;
    } else {
      loIdx -= 1;
      acc += vols[loIdx]!;
    }
  }
  const stacked: ClusterStack[] = [];
  let run: ClusterStack | null = null;
  for (const b of bins) {
    if (!b.imbalance) {
      if (run) stacked.push(run);
      run = null;
      continue;
    }
    if (run && run.side === b.imbalance) run.to = b.price;
    else {
      if (run) stacked.push(run);
      run = { side: b.imbalance, from: b.price, to: b.price };
    }
  }
  if (run) stacked.push(run);
  const stacks = stacked.filter((s) => Math.abs(s.to - s.from) > span * 0.04 || bins.filter((b) => b.imbalance === s.side).length >= 3);

  const top = bins.at(-1);
  const bot = bins[0];
  let unfinished: ClusterMap["unfinished"] = null;
  const topThin = top && top.sell < top.volume * 0.15;
  const botThin = bot && bot.buy < bot.volume * 0.15;
  if (topThin && botThin) unfinished = "both";
  else if (topThin) unfinished = "high";
  else if (botThin) unfinished = "low";

  const poc = bins[pocIdx]!.price;
  const vah = bins[hiIdx]!.price;
  const val = bins[loIdx]!.price;
  const stack = stacks[0];
  const because = stack
    ? `Стек ${stack.side === "buy" ? "покупок" : "продаж"} ${stack.from.toFixed(2)}–${stack.to.toFixed(2)}: на трёх и больше ценах перевес 3 к 1`
    : unfinished === "high"
      ? "Верх кластера не закрыт продажами — незавершённый аукцион сверху"
      : unfinished === "low"
        ? "Низ кластера не закрыт покупками — незавершённый аукцион снизу"
        : `POC ${poc.toFixed(2)} — цена, где торговали больше всего`;
  const therefore = stack
    ? stack.side === "buy"
      ? "Стек покупок — агрессия тейкеров вверх. Часто цена потом возвращается в этот кластер как в поддержку."
      : "Стек продаж — агрессия вниз. Этот кусок часто становится сопротивлением."
    : unfinished
      ? "Незавершённый край рынок часто доторговывает. Не ставить стоп ровно в тонкий принт."
      : "HVN (толстые кластеры) держат цену, LVN (тонкие) цена проходит быстро. Торгуют реакцию у POC/HVN, не середину пустоты.";

  return { bins, poc, vah, val, hvn: hvn.slice(0, 6), lvn: lvn.slice(0, 4), stacked: stacks.slice(0, 3), unfinished, source, because, therefore };
}

export function clustersFromTrades(trades: TapeTrade[]): ClusterMap | null {
  if (trades.length < 40) return null;
  const prices = trades.map((t) => t.price);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const { span, n } = binsFrom(lo, hi, 28);
  const raw = Array.from({ length: n }, () => ({ buy: 0, sell: 0 }));
  for (const t of trades) {
    const i = Math.min(n - 1, Math.max(0, Math.floor(((t.price - lo) / span) * n)));
    if (t.buy) raw[i]!.buy += t.qty;
    else raw[i]!.sell += t.qty;
  }
  return finish(raw, lo, span, n, "trades");
}

export function clustersFromCandles(candles: Candle[]): ClusterMap {
  const slice = candles.slice(-80);
  const lo = Math.min(...slice.map((c) => c.low));
  const hi = Math.max(...slice.map((c) => c.high));
  const { span, n } = binsFrom(lo, hi, 28);
  const raw = Array.from({ length: n }, () => ({ buy: 0, sell: 0 }));
  const cme = slice.some((c) => (c.cmeVolume ?? 0) > 0);
  for (const c of slice) {
    const v = barVolume(c);
    const body = Math.max(c.volume, 1);
    const buyShare = buyVolumeOf(c) / body;
    const buy = v * buyShare;
    const sell = Math.max(0, v - buy);
    const a = Math.min(n - 1, Math.max(0, Math.floor(((c.low - lo) / span) * n)));
    const b = Math.min(n - 1, Math.max(0, Math.floor(((c.high - lo) / span) * n)));
    const parts = Math.max(1, b - a + 1);
    for (let i = a; i <= b; i++) {
      const w = 1 / parts;
      raw[i]!.buy += buy * w;
      raw[i]!.sell += sell * w;
    }
  }
  const map = finish(raw, lo, span, n, cme ? "cme" : "profile");
  if (cme) {
    map.because = `CME delayed ${slice.find((c) => c.cmeTicker)?.cmeTicker ?? "фьючерс"}: ${map.because}`;
    map.therefore = `${map.therefore} Объём кластера — Чикаго с задержкой, не спот-тики брокера.`;
  }
  return map;
}

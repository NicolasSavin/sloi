import type { OptionsRow, OptionsSnapshot } from "@/lib/market/types";

interface YahooContract {
  strike?: number;
  openInterest?: number;
  volume?: number;
  impliedVolatility?: number;
}

function num(n: unknown) {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

function maxPain(calls: YahooContract[], puts: YahooContract[]) {
  const strikes = [...new Set([...calls, ...puts].map((c) => num(c.strike)).filter((n) => n > 0))].sort(
    (a, b) => a - b,
  );
  if (strikes.length === 0) return null;
  let best = strikes[0]!;
  let bestCost = Number.POSITIVE_INFINITY;
  for (const k of strikes) {
    let cost = 0;
    for (const c of calls) {
      const s = num(c.strike);
      if (k > s) cost += (k - s) * num(c.openInterest);
    }
    for (const p of puts) {
      const s = num(p.strike);
      if (k < s) cost += (s - k) * num(p.openInterest);
    }
    if (cost < bestCost) {
      bestCost = cost;
      best = k;
    }
  }
  return best;
}

export function parseYahooOptions(raw: unknown, ticker: string): OptionsSnapshot | null {
  const chain = (raw as { optionChain?: { result?: any[] } })?.optionChain?.result?.[0];
  if (!chain) return null;
  const spot = num(chain.quote?.regularMarketPrice);
  const pack = chain.options?.[0];
  const calls: YahooContract[] = pack?.calls ?? [];
  const puts: YahooContract[] = pack?.puts ?? [];
  if (!spot || (calls.length === 0 && puts.length === 0)) return null;
  const expiryUnix = num(pack?.expirationDate);
  const expiry = expiryUnix
    ? new Date(expiryUnix * 1000).toISOString().slice(0, 10)
    : "";
  const callOi = calls.reduce((s, c) => s + num(c.openInterest), 0);
  const putOi = puts.reduce((s, p) => s + num(p.openInterest), 0);
  const putCall = callOi > 0 ? putOi / callOi : null;
  const byStrike = new Map<number, OptionsRow>();
  for (const c of calls) {
    const strike = num(c.strike);
    if (!strike) continue;
    const row = byStrike.get(strike) ?? {
      strike,
      expiry,
      callOi: 0,
      putOi: 0,
      callVol: 0,
      putVol: 0,
      markIv: null,
    };
    row.callOi += num(c.openInterest);
    row.callVol += num(c.volume);
    row.markIv = num(c.impliedVolatility) || row.markIv;
    byStrike.set(strike, row);
  }
  for (const p of puts) {
    const strike = num(p.strike);
    if (!strike) continue;
    const row = byStrike.get(strike) ?? {
      strike,
      expiry,
      callOi: 0,
      putOi: 0,
      callVol: 0,
      putVol: 0,
      markIv: null,
    };
    row.putOi += num(p.openInterest);
    row.putVol += num(p.volume);
    byStrike.set(strike, row);
  }
  const rows = [...byStrike.values()].sort((a, b) => a.strike - b.strike);
  const magnets = [...rows]
    .sort((a, b) => b.callOi + b.putOi - (a.callOi + a.putOi))
    .slice(0, 3)
    .map((r) => r.strike);
  const pain = maxPain(calls, puts);
  const pcBit =
    putCall == null
      ? ""
      : putCall > 1.1
        ? "путы в перевесе — рынок страхуется"
        : putCall < 0.7
          ? "коллы в перевесе — ритейл гонится за ростом"
          : "P/C около нормы";
  const painBit = pain != null ? `макс. боль ${pain.toFixed(spot >= 50 ? 0 : 2)}` : "";
  return {
    currency: ticker,
    spot,
    maxPain: pain,
    callOi,
    putOi,
    putCall,
    magnetStrikes: magnets,
    rows: rows.filter((r) => r.callOi + r.putOi > 0).slice(0, 80),
    note: [`Опционы ${ticker}`, painBit, pcBit].filter(Boolean).join(". ") + ".",
  };
}

export type TvCandle = { open: number; close: number };

const cache = { at: 0, map: new Map<string, TvCandle>() };

function place(id: string): { scan: "forex" | "cfd" | "crypto"; ticker: string } | null {
  if (id === "XAUUSD") return { scan: "cfd", ticker: "TVC:GOLD" };
  if (id === "XAGUSD") return { scan: "cfd", ticker: "TVC:SILVER" };
  if (id === "XTIUSD" || id === "USOIL") return { scan: "cfd", ticker: "TVC:USOIL" };
  if (id === "XBRUSD") return { scan: "cfd", ticker: "TVC:UKOIL" };
  if (id === "BTCUSD" || id === "BTCUSDT") return { scan: "crypto", ticker: "BINANCE:BTCUSDT" };
  if (id === "ETHUSD" || id === "ETHUSDT") return { scan: "crypto", ticker: "BINANCE:ETHUSDT" };
  if (/^[A-Z]{6}$/.test(id)) return { scan: "forex", ticker: `FX:${id}` };
  return null;
}

export function minLeadPct(id: string) {
  if (id === "XAUUSD" || id === "XAGUSD") return 0.008;
  if (id.includes("JPY")) return 0.006;
  if (/BTC|ETH|LTC|XRP|TON|BCH/.test(id)) return 0.04;
  return 0.004;
}

/** 5-minute TradingView candle. One request per market group, cached for a minute. */
export async function tvCandles(ids: string[]): Promise<Map<string, TvCandle>> {
  if (Date.now() - cache.at < 60_000 && cache.map.size) return cache.map;
  const groups = new Map<string, { id: string; ticker: string }[]>();
  for (const id of ids) {
    const p = place(id);
    if (!p) continue;
    const list = groups.get(p.scan) ?? [];
    list.push({ id, ticker: p.ticker });
    groups.set(p.scan, list);
  }
  const map = new Map<string, TvCandle>();
  await Promise.all(
    [...groups.entries()].map(async ([scan, list]) => {
      try {
        const res = await fetch(`https://scanner.tradingview.com/${scan}/scan`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            symbols: { tickers: list.map((x) => x.ticker) },
            columns: ["close|5", "open|5"],
          }),
          signal: AbortSignal.timeout(4000),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { data?: { s: string; d: number[] }[] };
        for (const row of data.data ?? []) {
          const hit = list.find((x) => x.ticker === row.s);
          const close = row.d?.[0];
          const open = row.d?.[1];
          if (!hit || !close || !open) continue;
          map.set(hit.id, { open, close });
        }
      } catch {
        /* TV is a hint, the desk still runs */
      }
    }),
  );
  if (map.size) {
    cache.at = Date.now();
    cache.map = map;
  }
  return map.size ? map : cache.map;
}

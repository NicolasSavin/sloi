export type TvCandle = { open: number; close: number };

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

const caches = new Map<number, { at: number; map: Map<string, TvCandle> }>();

/** TradingView candle, 5 or 15 minutes. One request per market group. */
export async function tvCandles(ids: string[], minutes: 5 | 15 = 5): Promise<Map<string, TvCandle>> {
  const hit = caches.get(minutes);
  if (hit && Date.now() - hit.at < 60_000 && hit.map.size) return hit.map;
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
            columns: [`close|${minutes}`, `open|${minutes}`],
          }),
          signal: AbortSignal.timeout(4000),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { data?: { s: string; d: number[] }[] };
        for (const row of data.data ?? []) {
          const found = list.find((x) => x.ticker === row.s);
          const close = row.d?.[0];
          const open = row.d?.[1];
          if (!found || !close || !open) continue;
          map.set(found.id, { open, close });
        }
      } catch {
        /* TV is a hint */
      }
    }),
  );
  if (map.size) caches.set(minutes, { at: Date.now(), map });
  return map.size ? map : (hit?.map ?? map);
}

export const LEAD_SYMBOLS = [
  "EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "USDCAD", "NZDUSD",
  "EURGBP", "EURJPY", "GBPJPY", "AUDJPY", "CADJPY", "NZDJPY", "EURCHF", "EURAUD", "GBPAUD",
  "XAUUSD", "XAGUSD", "XTIUSD", "XBRUSD",
];

export async function renderTv15() {
  const map = await tvCandles(LEAD_SYMBOLS, 15);
  const lines = ["# SLOI TV15 open close"];
  for (const id of LEAD_SYMBOLS) {
    const c = map.get(id);
    if (!c) continue;
    lines.push(`${id} ${c.open} ${c.close}`);
  }
  return `${lines.join("\n")}\n`;
}

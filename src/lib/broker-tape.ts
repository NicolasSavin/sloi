export interface BrokerTick {
  id: string;
  bid: number;
  ask: number;
  at: number;
}

export interface BookLevel {
  side: "bid" | "ask";
  price: number;
  volume: number;
}

export interface BrokerBook {
  id: string;
  at: number;
  bids: BookLevel[];
  asks: BookLevel[];
  iceberg: string | null;
}

const ticks = new Map<string, BrokerTick>();
const books = new Map<string, BrokerBook>();

function icebergOf(bids: BookLevel[], asks: BookLevel[]): string | null {
  const pile = [...bids, ...asks];
  if (pile.length < 3) return null;
  const avg = pile.reduce((s, l) => s + l.volume, 0) / pile.length;
  const fat = pile.find((l) => l.volume > avg * 3.2 && l.volume > 0);
  if (!fat) return null;
  return fat.side === "bid"
    ? `Толстый бид ${fat.volume} на ${fat.price} — похоже на айсберг/лимит, который не пускает вниз.`
    : `Толстый аск ${fat.volume} на ${fat.price} — лимит сверху, часто прячут объём.`;
}

export function ingestBrokerTape(text: string) {
  const at = Date.now();
  for (const raw of text.split(/\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const p = line.split(/\s+/);
    if (p[0] === "BOOK" && p.length >= 5) {
      const id = p[1]!.replace(/[^A-Za-z]/g, "").toUpperCase();
      const bids: BookLevel[] = [];
      const asks: BookLevel[] = [];
      for (let i = 2; i + 2 < p.length; i += 3) {
        const side = p[i] === "S" ? "ask" : p[i] === "B" ? "bid" : null;
        const price = Number(p[i + 1]);
        const volume = Number(p[i + 2]);
        if (!side || !Number.isFinite(price) || !Number.isFinite(volume)) continue;
        (side === "bid" ? bids : asks).push({ side, price, volume });
      }
      books.set(id, { id, at, bids, asks, iceberg: icebergOf(bids, asks) });
      continue;
    }
    if (p.length < 3) continue;
    const id = p[0]!.replace(/[^A-Za-z]/g, "").toUpperCase();
    const bid = Number(p[1]);
    const ask = Number(p[2]);
    if (!id || !Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0) continue;
    ticks.set(id, { id, bid, ask, at });
  }
}

export function brokerMid(id: string): number | null {
  const t = ticks.get(id);
  if (!t) return null;
  if (Date.now() - t.at > 90_000) return null;
  return (t.bid + t.ask) / 2;
}

export function brokerSkewPct(id: string, site: number): number | null {
  const mid = brokerMid(id);
  if (mid == null || site <= 0) return null;
  return (Math.abs(mid - site) / site) * 100;
}

export function brokerBook(id: string): BrokerBook | null {
  const b = books.get(id);
  if (!b) return null;
  if (Date.now() - b.at > 90_000) return null;
  return b;
}

export function snapshotBroker() {
  const now = Date.now();
  return {
    ticks: [...ticks.values()].filter((t) => now - t.at < 90_000),
    books: [...books.values()].filter((b) => now - b.at < 90_000),
  };
}

export function exportBrokerTape(): string {
  const now = Date.now();
  const lines = [`# SLOI broker ${new Date(now).toISOString()}`];
  for (const t of ticks.values()) {
    const age = Math.round((now - t.at) / 1000);
    lines.push(`${t.id} ${t.bid} ${t.ask} age=${age}s`);
  }
  for (const b of books.values()) {
    const bits = b.asks.map((l) => `S ${l.price} ${l.volume}`).concat(b.bids.map((l) => `B ${l.price} ${l.volume}`));
    lines.push(`BOOK ${b.id} ${bits.join(" ")}`);
  }
  return `${lines.join("\n")}\n`;
}

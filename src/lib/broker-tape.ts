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

export interface BrokerPos {
  ticket: number;
  id: string;
  side: "buy" | "sell";
  lots: number;
  open: number;
  sl: number;
  tp: number;
  profit: number;
  magic: number;
}

export interface BrokerAccount {
  login: string;
  server: string;
  currency: string;
  leverage: number;
  balance: number;
  equity: number;
  margin: number;
  free: number;
  profit: number;
  at: number;
  positions: BrokerPos[];
}

type Room = {
  ticks: Map<string, BrokerTick>;
  books: Map<string, BrokerBook>;
  account: BrokerAccount | null;
};

const g = globalThis as typeof globalThis & { __sloiRooms__?: Map<string, Room> };
function rooms() {
  if (!g.__sloiRooms__) g.__sloiRooms__ = new Map();
  return g.__sloiRooms__;
}
function room(tenant = "legacy"): Room {
  const map = rooms();
  let r = map.get(tenant);
  if (!r) {
    r = { ticks: new Map(), books: new Map(), account: null };
    map.set(tenant, r);
  }
  return r;
}

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

function num(v: string | undefined) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function ingestBrokerTape(text: string, tenant = "legacy") {
  const at = Date.now();
  const r = room(tenant);
  const pos: BrokerPos[] = [];
  let nextAcc: BrokerAccount | null = null;
  for (const raw of text.split(/\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const p = line.split(/\s+/);
    if (p[0] === "ACCOUNT" && p.length >= 8) {
      nextAcc = {
        login: (p[1] ?? "").slice(-6),
        server: (p[2] ?? "").replace(/_/g, " ").slice(0, 48),
        balance: num(p[3]),
        equity: num(p[4]),
        margin: num(p[5]),
        free: num(p[6]),
        profit: num(p[7]),
        leverage: num(p[8]),
        currency: (p[9] ?? "USD").replace(/[^A-Za-z]/g, "").slice(0, 8) || "USD",
        at,
        positions: [],
      };
      continue;
    }
    if (p[0] === "POS" && p.length >= 8) {
      const side = p[3] === "SELL" || p[3] === "sell" ? "sell" : "buy";
      pos.push({
        ticket: num(p[1]),
        id: (p[2] ?? "").replace(/[^A-Za-z]/g, "").toUpperCase(),
        side,
        lots: num(p[4]),
        open: num(p[5]),
        sl: num(p[6]),
        tp: num(p[7]),
        profit: num(p[8]),
        magic: num(p[9]),
      });
      continue;
    }
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
      r.books.set(id, { id, at, bids, asks, iceberg: icebergOf(bids, asks) });
      continue;
    }
    if (p.length < 3) continue;
    const id = p[0]!.replace(/[^A-Za-z]/g, "").toUpperCase();
    const bid = Number(p[1]);
    const ask = Number(p[2]);
    if (!id || !Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0) continue;
    r.ticks.set(id, { id, bid, ask, at });
  }
  if (nextAcc) {
    nextAcc.positions = pos.slice(0, 24);
    r.account = nextAcc;
  } else if (pos.length && r.account && Date.now() - r.account.at < 120_000) {
    r.account = { ...r.account, at, positions: pos.slice(0, 24) };
  }
  return r.account;
}

export function brokerMid(id: string, tenant = "legacy"): number | null {
  const t = room(tenant).ticks.get(id);
  if (!t) return null;
  if (Date.now() - t.at > 90_000) return null;
  return (t.bid + t.ask) / 2;
}

export function brokerSkewPct(id: string, site: number, tenant = "legacy"): number | null {
  const mid = brokerMid(id, tenant);
  if (mid == null || site <= 0) return null;
  return (Math.abs(mid - site) / site) * 100;
}

export function brokerBook(id: string, tenant = "legacy"): BrokerBook | null {
  const b = room(tenant).books.get(id);
  if (!b) return null;
  if (Date.now() - b.at > 90_000) return null;
  return b;
}

export function brokerAccount(tenant = "legacy"): BrokerAccount | null {
  const a = room(tenant).account;
  if (!a) return null;
  if (Date.now() - a.at > 180_000) return null;
  return a;
}

export function snapshotBroker(tenant = "legacy") {
  const now = Date.now();
  const r = room(tenant);
  return {
    ticks: [...r.ticks.values()].filter((t) => now - t.at < 90_000),
    books: [...r.books.values()].filter((b) => now - b.at < 90_000),
    account: tenant === "legacy" ? null : brokerAccount(tenant),
    tenant: tenant === "legacy" ? null : tenant,
  };
}

export function hydrateAccount(tenant: string, account: BrokerAccount | null) {
  if (!account) return;
  room(tenant).account = account;
}

export function exportBrokerTape(tenant = "legacy"): string {
  const now = Date.now();
  const r = room(tenant);
  const lines = [`# SLOI broker ${new Date(now).toISOString()}`];
  const acc = tenant === "legacy" ? null : brokerAccount(tenant);
  if (acc) {
    lines.push(
      `ACCOUNT ${acc.login} ${acc.server.replace(/\s+/g, "_")} ${acc.balance} ${acc.equity} ${acc.margin} ${acc.free} ${acc.profit} ${acc.leverage} ${acc.currency}`,
    );
    for (const p of acc.positions) {
      lines.push(
        `POS ${p.ticket} ${p.id} ${p.side === "sell" ? "SELL" : "BUY"} ${p.lots} ${p.open} ${p.sl} ${p.tp} ${p.profit} ${p.magic}`,
      );
    }
  }
  for (const t of r.ticks.values()) {
    const age = Math.round((now - t.at) / 1000);
    lines.push(`${t.id} ${t.bid} ${t.ask} age=${age}s`);
  }
  for (const b of r.books.values()) {
    const bits = b.asks.map((l) => `S ${l.price} ${l.volume}`).concat(b.bids.map((l) => `B ${l.price} ${l.volume}`));
    lines.push(`BOOK ${b.id} ${bits.join(" ")}`);
  }
  return `${lines.join("\n")}\n`;
}

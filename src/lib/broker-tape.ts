import type { VolumeNode } from "@/lib/smc/micro";

export interface BrokerTick {
  id: string;
  bid: number;
  ask: number;
  at: number;
}

export interface CdBar {
  time: number;
  volume: number;
  delta: number;
  ask: number;
  bid: number;
  splash: boolean;
  infusion: boolean;
  imbalance: boolean;
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
  clusters: Map<string, { at: number; nodes: VolumeNode[] }>;
  profiles: Map<string, { at: number; poc: number; vah: number; val: number }>;
  askbid: Map<string, { at: number; ask: number; bid: number }>;
  flow: Map<string, { at: number; volume: number; delta: number }>;
  cdBars: Map<string, CdBar[]>;
  cum: Map<string, { at: number; path: { time: number; value: number }[] }>;
  ohlc: Map<string, { at: number; bars: { time: number; open: number; high: number; low: number; close: number }[] }>;
  cdStat: Map<string, { at: number; volume: number; delta: number; splash: boolean; onChart: boolean }>;
  cdCharts: string;
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
    r = { ticks: new Map(), books: new Map(), account: null, clusters: new Map(), profiles: new Map(), askbid: new Map(), flow: new Map(), cdBars: new Map(), cum: new Map(), ohlc: new Map(), cdStat: new Map(), cdCharts: "" };
    map.set(tenant, r);
  }
  if (!r.profiles) r.profiles = new Map();
  if (!r.clusters) r.clusters = new Map();
  if (!r.askbid) r.askbid = new Map();
  if (!r.flow) r.flow = new Map();
  if (!r.cdBars) r.cdBars = new Map();
  if (!r.cum) r.cum = new Map();
  if (!r.ohlc) r.ohlc = new Map();
  if (!r.cdStat) r.cdStat = new Map();
  if (r.cdCharts == null) r.cdCharts = "";
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
  const batch = new Map<string, VolumeNode[]>();
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
    if (p[0] === "CLUSTER" && p.length >= 5) {
      const id = (p[1] ?? "").replace(/[^A-Za-z]/g, "").toUpperCase();
      const kind =
        p[2] === "SPLASH" || p[2] === "splash" || p[2] === "BTRADE" || p[2] === "btrade"
          ? "splash"
          : p[2] === "IMBALANCE" || p[2] === "imbalance"
            ? "imbalance"
            : "infusion";
      const price = Number(p[3]);
      const side = p[4] === "SELL" || p[4] === "sell" ? "sell" : "buy";
      const ts = p.length >= 6 ? Number(p[5]) : 0;
      if (!id || !Number.isFinite(price) || price <= 0) continue;
      const list = batch.get(id) ?? [];
      const time = ts > 1_000_000_000 ? (ts > 1e12 ? Math.floor(ts / 1000) : ts) : Math.floor(at / 1000);
      list.push({ price, side, kind, time });
      batch.set(id, list);
      continue;
    }
    if (p[0] === "PROFILE" && p.length >= 5) {
      const id = (p[1] ?? "").replace(/[^A-Za-z]/g, "").toUpperCase();
      const poc = Number(p[2]);
      const vah = Number(p[3]);
      const val = Number(p[4]);
      if (id && poc > 0 && vah > 0 && val > 0) r.profiles.set(id, { at, poc, vah, val });
      continue;
    }
    if (p[0] === "ASKBID" && p.length >= 4) {
      const id = (p[1] ?? "").replace(/[^A-Za-z]/g, "").toUpperCase();
      const ask = Number(p[2]);
      const bid = Number(p[3]);
      if (id && ask >= 0 && bid >= 0) r.askbid.set(id, { at, ask, bid });
      continue;
    }
    if (p[0] === "VOLUME" && p.length >= 3) {
      const id = (p[1] ?? "").replace(/[^A-Za-z]/g, "").toUpperCase();
      const volume = Number(p[2]);
      if (id && Number.isFinite(volume)) {
        const prev = r.flow.get(id);
        r.flow.set(id, { at, volume, delta: prev?.delta ?? 0 });
      }
      continue;
    }
    if (p[0] === "DELTA" && p.length >= 3) {
      const id = (p[1] ?? "").replace(/[^A-Za-z]/g, "").toUpperCase();
      const delta = Number(p[2]);
      if (id && Number.isFinite(delta)) {
        const prev = r.flow.get(id);
        r.flow.set(id, { at, volume: prev?.volume ?? 0, delta });
      }
      continue;
    }
    if (p[0] === "BAR" && p.length >= 7) {
      const id = (p[1] ?? "").replace(/[^A-Za-z]/g, "").toUpperCase();
      const time = Number(p[2]);
      const open = Number(p[3]);
      const high = Number(p[4]);
      const low = Number(p[5]);
      const close = Number(p[6]);
      if (id && time > 0 && open > 0 && high > 0 && low > 0 && close > 0) {
        const prev = r.ohlc.get(id);
        const bars = [...(prev?.bars ?? [])];
        const i = bars.findIndex((b) => b.time === time);
        const bar = { time, open, high, low, close };
        if (i >= 0) bars[i] = bar;
        else bars.push(bar);
        bars.sort((a, b) => a.time - b.time);
        r.ohlc.set(id, { at, bars: bars.slice(-64) });
      }
      continue;
    }
    if (p[0] === "CUMDELTA" && p.length >= 3) {
      const id = (p[1] ?? "").replace(/[^A-Za-z]/g, "").toUpperCase();
      const a = Number(p[2]);
      const b = Number(p[3]);
      if (id && Number.isFinite(a)) {
        const time = Number.isFinite(b) && a > 1_000_000 ? a : Math.floor(Date.now() / 1000);
        const value = Number.isFinite(b) && a > 1_000_000 ? b : a;
        const prev = r.cum.get(id);
        const path = [...(prev?.path ?? [])];
        const i = path.findIndex((x) => x.time === time);
        if (i >= 0) path[i] = { time, value };
        else path.push({ time, value });
        path.sort((x, y) => x.time - y.time);
        r.cum.set(id, { at, path: path.slice(-64) });
      }
      continue;
    }
    if (p[0] === "CDBAR" && p.length >= 6) {
      const id = (p[1] ?? "").replace(/[^A-Za-z]/g, "").toUpperCase();
      const time = Number(p[2]);
      const volume = Number(p[3]);
      const delta = Number(p[4]);
      const ask = Number(p[5]);
      const bid = Number(p[6]);
      const splash = p[7] === "1";
      const infusion = p[8] === "1";
      const imbalance = p[9] === "1";
      if (id && time > 0) {
        const bar: CdBar = { time, volume, delta, ask, bid, splash, infusion, imbalance };
        const list = r.cdBars.get(id) ?? [];
        const i = list.findIndex((b) => b.time === time);
        if (i >= 0) list[i] = bar;
        else list.push(bar);
        list.sort((a, b) => a.time - b.time);
        r.cdBars.set(id, list.slice(-80));
      }
      continue;
    }
    if (p[0] === "CDCHARTS" && p.length >= 2) {
      r.cdCharts = p.slice(1).join(",");
      continue;
    }
    if (p[0] === "CDSTAT" && p.length >= 5) {
      const id = (p[1] ?? "").replace(/[^A-Za-z]/g, "").toUpperCase();
      const volume = Number(p[2]);
      const delta = Number(p[3]);
      const splash = p[4] === "1";
      const onChart = p[5] === "1";
      if (id) r.cdStat.set(id, { at, volume: volume || 0, delta: delta || 0, splash, onChart });
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
  for (const [id, nodes] of batch) {
    const prev = r.clusters.get(id)?.nodes ?? [];
    const map = new Map<string, (typeof nodes)[0]>();
    for (const n of prev) map.set(`${n.kind}:${n.time}:${n.price.toFixed(3)}`, n);
    for (const n of nodes) map.set(`${n.kind}:${n.time}:${n.price.toFixed(3)}`, n);
    r.clusters.set(id, {
      at,
      nodes: [...map.values()].sort((a, b) => a.time - b.time).slice(-160),
    });
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

export function liveAskBid(id: string): { ask: number; bid: number } | null {
  const now = Date.now();
  for (const roomItem of rooms().values()) {
    const a = roomItem.askbid.get(id);
    if (a && now - a.at < 90_000) return { ask: a.ask, bid: a.bid };
  }
  return null;
}

export function liveCdFlow(id: string): { volume: number; delta: number } | null {
  const now = Date.now();
  for (const roomItem of rooms().values()) {
    const f = roomItem.flow.get(id);
    if (f && now - f.at < 90_000) return { volume: f.volume, delta: f.delta };
  }
  return null;
}

export function liveProfile(id: string): { poc: number; vah: number; val: number } | null {
  const now = Date.now();
  for (const roomItem of rooms().values()) {
    const p = roomItem.profiles.get(id);
    if (p && now - p.at < 90_000) return { poc: p.poc, vah: p.vah, val: p.val };
  }
  return null;
}

export function liveCdCharts(): string {
  for (const r of rooms().values()) if (r.cdCharts) return r.cdCharts;
  return "";
}

export function liveCdStat(id: string): { volume: number; delta: number; splash: boolean; onChart: boolean } | null {
  const now = Date.now();
  for (const r of rooms().values()) {
    const s = r.cdStat.get(id);
    if (s && now - s.at < 180_000) return { volume: s.volume, delta: s.delta, splash: s.splash, onChart: s.onChart };
  }
  return null;
}

export function liveClusters(id: string): VolumeNode[] {
  const now = Date.now();
  const out: VolumeNode[] = [];
  for (const r of rooms().values()) {
    const c = r.clusters.get(id);
    if (c && now - c.at < 180_000) out.push(...c.nodes);
  }
  return out;
}

export function snapshotBroker(tenant = "legacy") {
  const now = Date.now();
  const mergeRoom = (r: Room) => {
    const askbid: Record<string, { ask: number; bid: number }> = {};
    for (const [id, v] of r.askbid) if (now - v.at < 180_000) askbid[id] = { ask: v.ask, bid: v.bid };
    const flow: Record<string, { volume: number; delta: number }> = {};
    for (const [id, v] of r.flow) if (now - v.at < 180_000) flow[id] = { volume: v.volume, delta: v.delta };
    const clusters: Record<string, VolumeNode[]> = {};
    for (const [id, v] of r.clusters) if (now - v.at < 180_000) clusters[id] = v.nodes;
    const bars: Record<string, CdBar[]> = {};
    for (const [id, v] of r.cdBars) bars[id] = v;
    const cum: Record<string, { time: number; value: number }[]> = {};
    for (const [id, v] of r.cum) if (now - v.at < 180_000) cum[id] = v.path;
    const ohlc: Record<string, { time: number; open: number; high: number; low: number; close: number }[]> = {};
    for (const [id, v] of r.ohlc) if (now - v.at < 900_000) ohlc[id] = v.bars;
    const stat: Record<string, { volume: number; delta: number; splash: boolean; onChart: boolean }> = {};
    for (const [id, v] of r.cdStat) if (now - v.at < 180_000) stat[id] = { volume: v.volume, delta: v.delta, splash: v.splash, onChart: v.onChart };
    return { askbid, flow, clusters, bars, cum, ohlc, stat, charts: r.cdCharts || "" };
  };
  const pub = mergeRoom(room("public"));
  const own = mergeRoom(room(tenant));
  const cd = {
    askbid: { ...pub.askbid, ...own.askbid },
    flow: { ...pub.flow, ...own.flow },
    clusters: { ...pub.clusters, ...own.clusters },
    bars: { ...pub.bars, ...own.bars },
    cum: { ...pub.cum, ...own.cum },
    ohlc: { ...pub.ohlc, ...own.ohlc },
    stat: { ...pub.stat, ...own.stat },
    charts: own.charts || pub.charts || "",
  };
  const r = room(tenant);
  return {
    ticks: [...r.ticks.values()].filter((t) => now - t.at < 90_000),
    books: [...r.books.values()].filter((b) => now - b.at < 90_000),
    account: tenant === "legacy" || tenant === "public" ? null : brokerAccount(tenant),
    tenant: tenant === "legacy" || tenant === "public" ? null : tenant,
    cd,
  };
}

export function hydrateClientCd(cd: { askbid?: Record<string, { ask: number; bid: number }>; flow?: Record<string, { volume: number; delta: number }>; clusters?: Record<string, VolumeNode[]>; bars?: Record<string, CdBar[]>; cum?: Record<string, { time: number; value: number }[]>; ohlc?: Record<string, { time: number; open: number; high: number; low: number; close: number }[]>; stat?: Record<string, { volume: number; delta: number; splash: boolean; onChart: boolean }>; charts?: string } | null | undefined) {
  if (!cd) return;
  const r = room("client");
  const at = Date.now();
  r.askbid = new Map();
  r.flow = new Map();
  r.clusters = new Map();
  r.cdBars = new Map();
  r.cum = new Map();
  r.ohlc = new Map();
  r.cdStat = new Map();
  r.cdCharts = cd.charts ?? "";
  for (const [id, v] of Object.entries(cd.askbid ?? {})) r.askbid.set(id, { at, ask: v.ask, bid: v.bid });
  for (const [id, v] of Object.entries(cd.flow ?? {})) r.flow.set(id, { at, volume: v.volume, delta: v.delta });
  for (const [id, v] of Object.entries(cd.clusters ?? {})) r.clusters.set(id, { at, nodes: v });
  for (const [id, v] of Object.entries(cd.bars ?? {})) r.cdBars.set(id, v);
  for (const [id, v] of Object.entries(cd.cum ?? {})) r.cum.set(id, { at, path: v });
  for (const [id, v] of Object.entries(cd.ohlc ?? {})) r.ohlc.set(id, { at, bars: v });
  for (const [id, v] of Object.entries(cd.stat ?? {})) r.cdStat.set(id, { at, ...v });
}

export function clipWicks<T extends { open: number; high: number; low: number; close: number }>(cs: T[]): T[] {
  if (cs.length < 1) return cs;
  const win = cs.slice(-80);
  const px = Math.abs(win.at(-1)?.close ?? 1) || 1;
  const bodies = win
    .map((c) => Math.abs(c.close - c.open))
    .filter((x) => x > 0)
    .sort((a, b) => a - b);
  const medB = bodies.length >= 5 ? bodies[Math.floor(bodies.length / 2)]! : px * 0.001;
  const cap = Math.min(Math.max(medB * 1.45, px * 0.00045), px * 0.006);
  return cs.map((c) => {
    const top = Math.max(c.open, c.close);
    const bot = Math.min(c.open, c.close);
    return { ...c, high: Math.min(c.high, top + cap), low: Math.max(c.low, bot - cap) };
  });
}

export function liveOhlc(id: string): { time: number; open: number; high: number; low: number; close: number }[] {
  const map = new Map<number, { time: number; open: number; high: number; low: number; close: number }>();
  const now = Date.now();
  for (const r of rooms().values()) {
    const v = r.ohlc.get(id);
    if (!v || now - v.at > 900_000) continue;
    for (const b of v.bars) map.set(b.time, b);
  }
  return [...map.values()].sort((a, b) => a.time - b.time);
}

export function mergeBrokerCandles<T extends { time: number; open: number; high: number; low: number; close: number; volume?: number }>(
  web: T[],
  broker: { time: number; open: number; high: number; low: number; close: number }[],
): T[] {
  if (broker.length < 1 || web.length < 3) return web;
  const step = Math.abs(web[1]!.time - web[0]!.time) || 3600;
  if (step < 2700 || step > 4500) return web;
  const bySnap = new Map<number, (typeof broker)[0]>();
  for (const b of broker) bySnap.set(Math.round(b.time / step) * step, b);
  return web.map((c) => {
    const t = Math.round(c.time / step) * step;
    const b = bySnap.get(t) ?? broker.find((x) => Math.abs(x.time - c.time) < step * 0.51);
    if (!b || b.high < b.low || b.high <= 0) return c;
    return { ...c, open: b.open, high: b.high, low: b.low, close: b.close };
  });
}

export function liveCumDelta(id: string): { time: number; value: number }[] {
  const map = new Map<number, number>();
  const now = Date.now();
  for (const r of rooms().values()) {
    const v = r.cum.get(id);
    if (!v || now - v.at > 180_000) continue;
    for (const p of v.path) map.set(p.time, p.value);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([time, value]) => ({ time, value }));
}

export function liveCdBars(id: string): CdBar[] {
  const map = new Map<number, CdBar>();
  for (const r of rooms().values()) {
    for (const b of r.cdBars.get(id) ?? []) map.set(b.time, b);
  }
  return [...map.values()].sort((a, b) => a.time - b.time);
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
  for (const [id, list] of r.cdBars) {
    for (const b of list) {
      lines.push(`CDBAR ${id} ${b.time} ${b.volume} ${b.delta} ${b.ask} ${b.bid} ${b.splash ? 1 : 0} ${b.infusion ? 1 : 0} ${b.imbalance ? 1 : 0}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

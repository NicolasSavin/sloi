export interface BrokerTick {
  id: string;
  bid: number;
  ask: number;
  at: number;
}

const ticks = new Map<string, BrokerTick>();

export function ingestBrokerTape(text: string) {
  const at = Date.now();
  for (const raw of text.split(/\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const p = line.split(/\s+/);
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

export function exportBrokerTape(): string {
  const now = Date.now();
  const lines = [`# SLOI broker ${new Date(now).toISOString()}`];
  for (const t of ticks.values()) {
    const age = Math.round((now - t.at) / 1000);
    lines.push(`${t.id} ${t.bid} ${t.ask} age=${age}s`);
  }
  return `${lines.join("\n")}\n`;
}

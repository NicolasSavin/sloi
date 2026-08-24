import type { DigestMarket } from "@/lib/digest";
import type { NewsHalt } from "@/lib/calendar";
import type { SignalHit } from "@/lib/dispatch-store";
import { settleHit, bookStats } from "@/lib/signal-book";

const g = globalThis as typeof globalThis & { __sloiArchive__?: SignalHit[] };

function store(): SignalHit[] {
  if (!g.__sloiArchive__) g.__sloiArchive__ = [];
  return g.__sloiArchive__;
}

function dayKey(ms = Date.now()) {
  return new Date(ms).toISOString().slice(0, 10);
}

function signalId(symbol: string, action: "long" | "short", entry: number | null) {
  const e = entry != null && Number.isFinite(entry) ? entry.toFixed(5) : "0";
  return `${symbol}-${action}-${e}-${dayKey()}`;
}

/** Upsert open BUY/SELL from digest; settle existing opens against path. */
export function syncArchiveFromDigest(markets: DigestMarket[], halt?: NewsHalt) {
  const list = store();
  const byId = new Map(list.map((h) => [h.id, h]));

  for (const m of markets) {
    const action = m.advice.action;
    if (action !== "long" && action !== "short") continue;
    const entry = m.setup.entry;
    const stop = m.setup.stop;
    const target = m.setup.targets[0] ?? null;
    if (entry == null || stop == null) continue;
    const id = signalId(m.spec.id, action, entry);
    const existing = byId.get(id);
    if (existing) {
      if ((existing.status ?? "open") === "open") {
        const settled = settleHit(existing, m, halt);
        byId.set(id, settled);
      }
      continue;
    }
    byId.set(id, {
      id,
      at: Date.now(),
      symbol: m.spec.id,
      label: m.spec.label,
      action,
      entry,
      stop,
      target,
      title: m.advice.title,
      decimals: m.spec.decimals,
      status: "open",
    });
  }

  // settle other open rows with matching market
  for (const [id, h] of byId) {
    if ((h.status ?? "open") !== "open") continue;
    const m = markets.find((x) => x.spec.id === h.symbol);
    if (!m) continue;
    byId.set(id, settleHit(h, m, halt));
  }

  const next = [...byId.values()].sort((a, b) => (b.at ?? 0) - (a.at ?? 0)).slice(0, 500);
  g.__sloiArchive__ = next;
  return next;
}

export function getArchive() {
  return store().slice();
}

export function archivePayload() {
  const log = getArchive();
  return { log, stats: bookStats(log), at: Date.now() };
}

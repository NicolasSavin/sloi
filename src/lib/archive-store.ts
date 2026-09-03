import type { DigestMarket } from "@/lib/digest";
import type { NewsHalt } from "@/lib/calendar";
import type { Candle } from "@/lib/market/types";
import type { SignalHit } from "@/lib/dispatch-store";
import { settleHit, bookStats } from "@/lib/signal-book";

const g = globalThis as typeof globalThis & { __sloiArchive__?: SignalHit[] };

function mem(): SignalHit[] {
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

function rowToHit(r: Record<string, unknown>): SignalHit {
  return {
    id: String(r.id),
    at: new Date(String(r.at)).getTime(),
    symbol: String(r.symbol),
    label: String(r.label),
    action: r.action === "short" ? "short" : "long",
    entry: r.entry == null ? null : Number(r.entry),
    stop: r.stop == null ? null : Number(r.stop),
    target: r.target == null ? null : Number(r.target),
    title: String(r.title ?? ""),
    decimals: Number(r.decimals ?? 5),
    status: (r.status as SignalHit["status"]) ?? "open",
    closedAt: r.closed_at ? new Date(String(r.closed_at)).getTime() : undefined,
    exit: r.exit == null ? null : Number(r.exit),
    resultR: r.result_r == null ? null : Number(r.result_r),
    why: r.why == null ? undefined : String(r.why),
  };
}

async function loadFromDb(): Promise<SignalHit[] | null> {
  try {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql`
      select * from signal_archive
      order by at desc
      limit 500
    `;
    return rows.map((r) => rowToHit(r as Record<string, unknown>));
  } catch {
    return null;
  }
}

async function saveToDb(hits: SignalHit[]) {
  try {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    for (const h of hits.slice(0, 200)) {
      await sql`
        insert into signal_archive (
          id, at, symbol, label, action, entry, stop, target, title, decimals,
          status, closed_at, exit, result_r, why, filled, updated_at
        ) values (
          ${h.id},
          ${new Date(h.at).toISOString()},
          ${h.symbol},
          ${h.label},
          ${h.action},
          ${h.entry},
          ${h.stop},
          ${h.target},
          ${h.title},
          ${h.decimals},
          ${h.status ?? "open"},
          ${h.closedAt ? new Date(h.closedAt).toISOString() : null},
          ${h.exit ?? null},
          ${h.resultR ?? null},
          ${h.why ?? null},
          ${false},
          ${new Date().toISOString()}
        )
        on conflict (id) do update set
          status = excluded.status,
          closed_at = excluded.closed_at,
          exit = excluded.exit,
          result_r = excluded.result_r,
          why = excluded.why,
          updated_at = excluded.updated_at
      `;
    }
  } catch {
    /* no durable db */
  }
}

function paperWhy(h: SignalHit): SignalHit {
  if ((h.status ?? "open") === "open" || !h.why) return h;
  if (h.why.includes("бумажн")) return h;
  return {
    ...h,
    why: `Бумажный исход (цена касалась уровня; ордер в MT4 мог не открываться). ${h.why}`,
  };
}

/** Upsert open BUY/SELL from digest; settle existing opens against path. */
export async function syncArchiveFromDigest(
  markets: DigestMarket[],
  halt?: NewsHalt,
  candlesById?: Record<string, Candle[]>,
) {
  const fromDb = await loadFromDb();
  const list = fromDb ?? mem();
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
    const path = candlesById?.[m.spec.id];
    if (existing) {
      if ((existing.status ?? "open") === "open") {
        byId.set(id, paperWhy(settleHit(existing, m, halt, path)));
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
      why: "Сигнал сайта. Ордер откроется в MT4 только при АВТО и прохождении фильтров.",
    });
  }

  for (const [id, h] of byId) {
    if ((h.status ?? "open") !== "open") continue;
    const m = markets.find((x) => x.spec.id === h.symbol);
    if (!m) continue;
    byId.set(id, paperWhy(settleHit(h, m, halt, candlesById?.[h.symbol])));
  }

  const next = [...byId.values()].sort((a, b) => (b.at ?? 0) - (a.at ?? 0)).slice(0, 500);
  g.__sloiArchive__ = next;
  await saveToDb(next);
  return next;
}

export async function getArchiveAsync() {
  const fromDb = await loadFromDb();
  if (fromDb?.length) {
    g.__sloiArchive__ = fromDb;
    return fromDb;
  }
  return mem().slice();
}

export function getArchive() {
  return mem().slice();
}

export async function archivePayload() {
  const log = await getArchiveAsync();
  return { log, stats: bookStats(log), at: Date.now(), durable: Boolean(process.env.DATABASE_URL) };
}

export function stoppedMap(ms = 3 * 60 * 60_000) {
  const now = Date.now();
  const out = new Map<string, number>();
  for (const h of mem()) {
    if (h.status !== "stop") continue;
    const at = h.closedAt ?? h.at;
    if (now - at > ms) continue;
    const prev = out.get(h.symbol) ?? 0;
    if (at > prev) out.set(h.symbol, at);
  }
  return out;
}

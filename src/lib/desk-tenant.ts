import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getSql, dbSource, type Sql } from "@/lib/db";
import type { BrokerAccount } from "@/lib/broker-tape";

export const LEGACY_TENANT = "legacy";

type MemTenant = {
  id: string;
  keyHash: string;
  prefix: string;
  auto: boolean;
  tape: string;
  account: BrokerAccount | null;
  cmds: { id: string; kind: string; payload: string; at: number; status: string }[];
};

const g = globalThis as typeof globalThis & {
  __sloiTenants__?: Map<string, MemTenant>;
  __sloiDeskSchema__?: Promise<void>;
};
function mem() {
  if (!g.__sloiTenants__) g.__sloiTenants__ = new Map();
  return g.__sloiTenants__;
}

export function hashDeskKey(key: string) {
  return createHash("sha256").update(key.trim()).digest("hex");
}

function idFromHash(keyHash: string) {
  return keyHash.slice(0, 16);
}

function safeEqualHex(a: string, b: string) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  if (aa.length !== bb.length) return false;
  return timingSafeEqual(aa, bb);
}

async function trySql() {
  try {
    return await getSql();
  } catch {
    return null;
  }
}

async function ensureSchema(sql: Sql) {
  if (!g.__sloiDeskSchema__) {
    g.__sloiDeskSchema__ = (async () => {
      await sql.query(`
        create table if not exists desk_tenants (
          id text primary key,
          key_hash text not null unique,
          key_prefix text not null,
          label text,
          auto_trade boolean not null default true,
          created_at timestamptz not null default now(),
          last_seen timestamptz
        )
      `);
      await sql.query(`
        create table if not exists desk_tapes (
          tenant_id text primary key,
          body text,
          account_json text,
          updated_at timestamptz not null default now()
        )
      `);
      await sql.query(`
        create table if not exists desk_commands (
          id text primary key,
          tenant_id text not null references desk_tenants (id) on delete cascade,
          kind text not null,
          payload text not null default '',
          status text not null default 'pending',
          created_at timestamptz not null default now(),
          acked_at timestamptz
        )
      `);
      await sql.query(`
        create index if not exists desk_commands_pending_idx
        on desk_commands (tenant_id, status, created_at)
      `);
    })().catch((err) => {
      g.__sloiDeskSchema__ = undefined;
      throw err;
    });
  }
  await g.__sloiDeskSchema__;
}

async function upsertTenant(sql: Sql, id: string, keyHash: string, prefix: string) {
  await ensureSchema(sql);
  const existing = await sql<{ id: string; key_prefix: string; auto_trade: boolean }>`
    select id, key_prefix, auto_trade from desk_tenants where key_hash = ${keyHash} limit 1
  `;
  if (existing[0]) {
    await sql`update desk_tenants set last_seen = now() where id = ${existing[0].id}`;
    return existing[0];
  }
  try {
    await sql`
      insert into desk_tenants (id, key_hash, key_prefix, label)
      values (${id}, ${keyHash}, ${prefix}, ${"стол"})
    `;
  } catch {
    const raced = await sql<{ id: string; key_prefix: string; auto_trade: boolean }>`
      select id, key_prefix, auto_trade from desk_tenants where key_hash = ${keyHash} limit 1
    `;
    if (raced[0]) return raced[0];
  }
  return { id, key_prefix: prefix, auto_trade: true };
}

function remember(id: string, keyHash: string, prefix: string): MemTenant {
  const bag = mem();
  const hit = bag.get(keyHash);
  if (hit) return hit;
  const row: MemTenant = { id, keyHash, prefix, auto: true, tape: "", account: null, cmds: [] };
  bag.set(keyHash, row);
  return row;
}

export async function createDesk(label?: string) {
  const key = `sloi_${randomBytes(18).toString("base64url")}`;
  const keyHash = hashDeskKey(key);
  const id = idFromHash(keyHash);
  const prefix = key.slice(0, 12);
  const sql = await trySql();
  if (sql) {
    try {
      await upsertTenant(sql, id, keyHash, prefix);
    } catch {
      /* still return the key — resolveDesk upserts on next hit */
    }
  }
  remember(id, keyHash, prefix);
  return { id, key, prefix };
}

export async function resolveDesk(key: string | null | undefined) {
  const raw = (key ?? "").trim();
  if (!raw) return { id: LEGACY_TENANT, prefix: "legacy", auto: true };
  if (!validKeyShape(raw)) return null;
  const keyHash = hashDeskKey(raw);
  const id = idFromHash(keyHash);
  const prefix = raw.slice(0, 12);
  const sql = await trySql();
  if (sql) {
    try {
      const row = await upsertTenant(sql, id, keyHash, prefix);
      return { id: row.id, prefix: row.key_prefix, auto: Boolean(row.auto_trade) };
    } catch {
      /* fall through to deterministic id */
    }
  }
  const hit = remember(id, keyHash, prefix);
  return { id: hit.id, prefix: hit.prefix, auto: hit.auto };
}

export async function saveTape(tenantId: string, body: string, account: BrokerAccount | null) {
  const sql = await trySql();
  let saved = false;
  let err = "";
  if (sql && tenantId !== LEGACY_TENANT) {
    try {
      await ensureSchema(sql);
      await sql.query(
        `insert into desk_tapes (tenant_id, body, account_json, updated_at)
         values ($1, $2, $3, now())
         on conflict (tenant_id) do update set
           body = excluded.body,
           account_json = excluded.account_json,
           updated_at = now()`,
        [tenantId, body.slice(0, 24000), account ? JSON.stringify(account) : ""],
      );
      saved = true;
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    }
  }
  for (const t of mem().values()) {
    if (t.id === tenantId) {
      t.tape = body;
      t.account = account;
    }
  }
  return { saved, err, db: dbSource };
}

export async function loadTape(tenantId: string): Promise<{ body: string; account: BrokerAccount | null } | null> {
  const sql = await trySql();
  if (sql && tenantId !== LEGACY_TENANT) {
    try {
      await ensureSchema(sql);
      const rows = await sql<{ body: string | null; account_json: string | null }>`
        select body, account_json from desk_tapes where tenant_id = ${tenantId} limit 1
      `;
      const row = rows[0];
      if (row) {
        let account: BrokerAccount | null = null;
        if (row.account_json) {
          try {
            account = JSON.parse(row.account_json) as BrokerAccount;
          } catch {
            account = null;
          }
        }
        return { body: row.body ?? "", account };
      }
    } catch {
      /* memory */
    }
  }
  for (const t of mem().values()) {
    if (t.id === tenantId) return { body: t.tape, account: t.account };
  }
  return null;
}

export async function enqueueCommand(tenantId: string, kind: string, payload = "") {
  const id = randomBytes(5).toString("hex");
  const sql = await trySql();
  if (sql && tenantId !== LEGACY_TENANT) {
    try {
      await ensureSchema(sql);
      await sql`
        insert into desk_commands (id, tenant_id, kind, payload)
        values (${id}, ${tenantId}, ${kind}, ${payload})
      `;
    } catch {
      /* memory */
    }
  }
  for (const t of mem().values()) {
    if (t.id === tenantId) t.cmds.push({ id, kind, payload, at: Date.now(), status: "pending" });
  }
  return id;
}

export async function pendingCommandLines(tenantId: string) {
  const sql = await trySql();
  if (sql && tenantId !== LEGACY_TENANT) {
    try {
      await ensureSchema(sql);
      const rows = await sql<{ id: string; kind: string; payload: string }>`
        select id, kind, payload from desk_commands
        where tenant_id = ${tenantId} and status = 'pending'
          and created_at > now() - interval '15 minutes'
        order by created_at asc
        limit 12
      `;
      return rows.map((r) => `#CMD ${r.id} ${r.kind}${r.payload ? ` ${r.payload}` : ""}`);
    } catch {
      /* memory */
    }
  }
  const lines: string[] = [];
  const cut = Date.now() - 15 * 60_000;
  for (const t of mem().values()) {
    if (t.id !== tenantId) continue;
    for (const c of t.cmds) {
      if (c.status === "pending" && c.at > cut) lines.push(`#CMD ${c.id} ${c.kind}${c.payload ? ` ${c.payload}` : ""}`);
    }
  }
  return lines.slice(0, 12);
}

export async function ackCommands(tenantId: string, ids: string[]) {
  if (!ids.length) return;
  const sql = await trySql();
  if (sql && tenantId !== LEGACY_TENANT) {
    try {
      await ensureSchema(sql);
      for (const id of ids) {
        await sql`
          update desk_commands set status = 'acked', acked_at = now()
          where id = ${id} and tenant_id = ${tenantId}
        `;
      }
    } catch {
      /* memory */
    }
  }
  for (const t of mem().values()) {
    if (t.id !== tenantId) continue;
    for (const c of t.cmds) if (ids.includes(c.id)) c.status = "acked";
  }
}

export function validKeyShape(key: string) {
  return /^sloi_[A-Za-z0-9_-]{16,80}$/.test(key.trim());
}

export { safeEqualHex };

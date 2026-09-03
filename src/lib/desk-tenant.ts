import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getSql } from "@/lib/db";
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

const g = globalThis as typeof globalThis & { __sloiTenants__?: Map<string, MemTenant> };
function mem() {
  if (!g.__sloiTenants__) g.__sloiTenants__ = new Map();
  return g.__sloiTenants__;
}

export function hashDeskKey(key: string) {
  return createHash("sha256").update(key.trim()).digest("hex");
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

export async function createDesk(label?: string) {
  const key = `sloi_${randomBytes(18).toString("base64url")}`;
  const id = randomBytes(8).toString("hex");
  const keyHash = hashDeskKey(key);
  const prefix = key.slice(0, 12);
  const sql = await trySql();
  if (sql) {
    try {
      await sql`
        insert into desk_tenants (id, key_hash, key_prefix, label)
        values (${id}, ${keyHash}, ${prefix}, ${label ?? "стол"})
      `;
    } catch {
      /* table may not exist yet — memory */
    }
  }
  mem().set(keyHash, {
    id,
    keyHash,
    prefix,
    auto: true,
    tape: "",
    account: null,
    cmds: [],
  });
  return { id, key, prefix };
}

export async function resolveDesk(key: string | null | undefined) {
  const raw = (key ?? "").trim();
  if (!raw) return { id: LEGACY_TENANT, prefix: "legacy", auto: true };
  const keyHash = hashDeskKey(raw);
  const sql = await trySql();
  if (sql) {
    try {
      const rows = await sql<{ id: string; key_prefix: string; auto_trade: boolean }>`
        select id, key_prefix, auto_trade from desk_tenants where key_hash = ${keyHash} limit 1
      `;
      const row = rows[0];
      if (row) {
        await sql`update desk_tenants set last_seen = now() where id = ${row.id}`;
        return { id: row.id, prefix: row.key_prefix, auto: Boolean(row.auto_trade) };
      }
    } catch {
      /* fall through */
    }
  }
  const hit = mem().get(keyHash);
  if (hit) return { id: hit.id, prefix: hit.prefix, auto: hit.auto };
  return null;
}

export async function saveTape(tenantId: string, body: string, account: BrokerAccount | null) {
  const sql = await trySql();
  if (sql && tenantId !== LEGACY_TENANT) {
    try {
      await sql`
        insert into desk_tapes (tenant_id, body, account_json, updated_at)
        values (${tenantId}, ${body.slice(0, 20000)}, ${account ? JSON.stringify(account) : null}, now())
        on conflict (tenant_id) do update set
          body = excluded.body,
          account_json = excluded.account_json,
          updated_at = now()
      `;
    } catch {
      /* memory */
    }
  }
  for (const t of mem().values()) {
    if (t.id === tenantId) {
      t.tape = body;
      t.account = account;
    }
  }
}

export async function loadTape(tenantId: string): Promise<{ body: string; account: BrokerAccount | null } | null> {
  const sql = await trySql();
  if (sql && tenantId !== LEGACY_TENANT) {
    try {
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

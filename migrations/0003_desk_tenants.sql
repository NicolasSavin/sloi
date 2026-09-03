create table if not exists desk_tenants (
  id text primary key,
  key_hash text not null unique,
  key_prefix text not null,
  label text,
  auto_trade boolean not null default true,
  created_at timestamptz not null default now(),
  last_seen timestamptz
);

create table if not exists desk_tapes (
  tenant_id text primary key references desk_tenants (id) on delete cascade,
  body text,
  account_json text,
  updated_at timestamptz not null default now()
);

create table if not exists desk_commands (
  id text primary key,
  tenant_id text not null references desk_tenants (id) on delete cascade,
  kind text not null,
  payload text not null default '',
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  acked_at timestamptz
);

create index if not exists desk_commands_pending_idx on desk_commands (tenant_id, status, created_at);

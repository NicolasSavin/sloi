create table if not exists signal_archive (
  id text primary key,
  at timestamptz not null,
  symbol text not null,
  label text not null,
  action text not null,
  entry double precision,
  stop double precision,
  target double precision,
  title text,
  decimals int not null default 5,
  status text not null default 'open',
  closed_at timestamptz,
  exit double precision,
  result_r double precision,
  why text,
  filled boolean not null default false,
  filled_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists signal_archive_at_idx on signal_archive (at desc);
create index if not exists signal_archive_status_idx on signal_archive (status);

create table if not exists sketches (
  id text primary key,
  instrument text not null default '',
  notes text not null,
  image text not null,
  erase_token text not null,
  created_at timestamptz not null default now()
);

create index if not exists sketches_created_idx on sketches (created_at desc);

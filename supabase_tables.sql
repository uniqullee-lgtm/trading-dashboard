create table if not exists market_summary (
  id bigserial primary key,
  broker text not null,
  equity numeric,
  cash numeric,
  positions_count int,
  fx_rate numeric,
  currency text,
  updated_at timestamptz default now()
);

create table if not exists watchlist_quotes (
  id bigserial primary key,
  symbol text not null,
  price numeric,
  change_pct numeric,
  volume bigint,
  updated_at timestamptz default now()
);

create table if not exists investor_portfolios (
  id bigserial primary key,
  investor text not null,
  symbol text not null,
  shares bigint,
  value numeric,
  weight_pct numeric,
  updated_at timestamptz default now()
);

create table if not exists settings (
  key text primary key,
  value text,
  updated_at timestamptz default now()
);

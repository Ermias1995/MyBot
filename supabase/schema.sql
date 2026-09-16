-- Expense tracker schema. Run once in the Supabase SQL editor
-- (or apply migrations in order under supabase/migrations/).

create table if not exists users (
  telegram_id bigint primary key,
  first_name text,
  username text,
  created_at timestamptz not null default now()
);

create table if not exists categories (
  id bigint generated always as identity primary key,
  user_id bigint not null references users (telegram_id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists transactions (
  id bigint generated always as identity primary key,
  user_id bigint not null references users (telegram_id) on delete cascade,
  category_id bigint references categories (id) on delete set null,
  amount numeric(12, 2) not null check (amount > 0),
  note text not null default '',
  account text not null default 'Cash'
    check (account in ('Telebirr', 'CBE', 'Cash')),
  spent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Monthly budgets. category_id NULL = overall month budget;
-- otherwise a per-category cap for that month.
create table if not exists budgets (
  id bigint generated always as identity primary key,
  user_id bigint not null references users (telegram_id) on delete cascade,
  category_id bigint references categories (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  month_start date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_transactions_user_time
  on transactions (user_id, spent_at desc);
create index if not exists idx_categories_user
  on categories (user_id);
create index if not exists idx_budgets_user_month
  on budgets (user_id, month_start desc);

-- One overall budget per user per month
create unique index if not exists budgets_user_month_overall
  on budgets (user_id, month_start)
  where category_id is null;

-- One budget per category per user per month
create unique index if not exists budgets_user_month_category
  on budgets (user_id, month_start, category_id)
  where category_id is not null;

alter table users enable row level security;
alter table categories enable row level security;
alter table transactions enable row level security;
alter table budgets enable row level security;

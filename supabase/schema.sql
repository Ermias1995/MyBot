-- Expense tracker schema. Run once in the Supabase SQL editor.

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
  spent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_transactions_user_time
  on transactions (user_id, spent_at desc);
create index if not exists idx_categories_user
  on categories (user_id);

-- Bot and API use the service_role key (bypasses RLS).
-- Enabling RLS locks out anon/public clients unless policies are added.
alter table users enable row level security;
alter table categories enable row level security;
alter table transactions enable row level security;

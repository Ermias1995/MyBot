-- Apply in Supabase SQL editor if you already ran the original schema.

create table if not exists budgets (
  id bigint generated always as identity primary key,
  user_id bigint not null references users (telegram_id) on delete cascade,
  category_id bigint references categories (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  month_start date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_budgets_user_month
  on budgets (user_id, month_start desc);

create unique index if not exists budgets_user_month_overall
  on budgets (user_id, month_start)
  where category_id is null;

create unique index if not exists budgets_user_month_category
  on budgets (user_id, month_start, category_id)
  where category_id is not null;

alter table budgets enable row level security;

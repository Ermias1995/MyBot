# Expense Bot

Telegram expense tracker: chat bot for logging, Mini App dashboard for insights, Express API + Supabase behind both.

## Structure

```
expense-bot/
├── apps/
│   ├── bot/        # Telegram bot (long polling)
│   ├── api/        # Express API for the Mini App
│   └── miniapp/    # React + Vite Telegram Mini App
├── packages/
│   └── db/         # Shared Supabase client + queries
├── supabase/
│   └── schema.sql
└── .env.example
```

One `npm install` at the repo root — npm workspaces hoist dependencies (no separate installs per app).

## Setup

1. Node.js 18+
2. Create a bot with [@BotFather](https://t.me/BotFather)
3. Create a Supabase project and run `supabase/schema.sql` in the SQL editor
4. Copy `.env.example` → `.env` and fill in the values
5. For the Mini App locally, copy `apps/miniapp/.env.example` → `apps/miniapp/.env` (defaults are fine)
6. From the repo root:

```bash
npm install
```

## Run

```bash
npm run dev:bot    # Telegram bot
npm run dev:api    # API on http://localhost:3000
npm run dev:web    # Mini App (Vite; proxies /api → API)
```

## Features

**Bot**
- Log expenses: `150 lunch`
- Keyword category guess + inline pick when unsure
- `/start` `/summary` `/undo` `/categories`

**Mini App**
- Auth via Telegram `initData` (HMAC verified on the API)
- Dashboard: month total, category donut, 7-day chart, recent list

## API (all require `X-Telegram-Init-Data`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/me` | Auth smoke test |
| GET | `/api/dashboard` | Home screen payload (+ `budgetLeft` when set) |
| GET | `/api/categories` | List categories for forms |
| GET | `/api/accounts` | Payment channels: Telebirr, CBE, Cash |
| GET | `/api/transactions` | List (`from`, `to`, `categoryId`, `account`, `q`, `limit`, `offset`) |
| POST | `/api/transactions` | Add expense `{ amount, categoryId, note?, spentAt?, account? }` |
| GET/PATCH/DELETE | `/api/transactions/:id` | Read / update / delete one |
| GET | `/api/budgets` | List (`month=YYYY-MM`) |
| GET | `/api/budgets/summary` | Spent vs budget + status for Budgets UI |
| POST | `/api/budgets` | Upsert `{ amount, month?, categoryId? }` |
| GET/PATCH/DELETE | `/api/budgets/:id` | Read / update amount / delete |

If the project already had older tables, run in order:
1. `supabase/migrations/001_budgets.sql`
2. `supabase/migrations/002_transaction_account.sql`

## Notes

- Keep `SUPABASE_SERVICE_KEY` server-side only (root `.env`)
- “This month” uses the server machine’s local timezone
- Change-category on the bot and Add Expense in the Mini App are still placeholders

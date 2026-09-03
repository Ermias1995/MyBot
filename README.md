# Expense Bot

A Telegram bot for manual expense tracking, backed by Supabase (Postgres).

## Features

- Log an expense by texting an amount and a note: `150 lunch`, `2400 rent for september`
- The category is guessed from keywords in the note; when unsure, the bot shows inline buttons to pick one
- `/start` registers you and seeds default categories
- `/summary` shows this month's total spend broken down by category
- `/undo` deletes your last logged transaction
- `/categories` lists your categories
- A "Change category" button appears on logged expenses

## Setup

1. Install Node.js 18 or newer.
2. Create a bot with [@BotFather](https://t.me/BotFather) and copy the token.
3. Create a Supabase project, then open the SQL editor and run the contents of `supabase_schema.sql`.
4. `npm install`
5. Copy `.env.example` to `.env` and fill in:
   - `TELEGRAM_BOT_TOKEN` - from BotFather
   - `SUPABASE_URL` - Supabase -> Project Settings -> API
   - `SUPABASE_SERVICE_KEY` - the `service_role` secret key (server-side only; never commit it)
6. `npm start` (or `npm run dev` to auto-restart on file changes)

## Project layout

```
src/
  bot.js                  entry point: commands, message + callback handlers
  db/supabaseClient.js    single shared Supabase client
  db/queries.js           all database access (users, categories, transactions)
  parsers/manualParser.js "150 lunch" -> { amount, note } + category guessing
supabase_schema.sql      tables: users, categories, transactions
```

## Manual test checklist

1. `/start` -> welcome message, categories seeded
2. `150 lunch` -> logged, guessed category Food
3. `2400 rent for september` -> logged as Rent
4. `99 stuff and things` -> logged, inline category buttons appear; tap one -> "Category saved"
5. `/summary` -> totals add up, month breakdown is correct
6. `/undo` -> deletes the last transaction; `/summary` reflects it
7. `abc`, `150`, `-5 lunch` -> friendly usage errors

## Notes & known limitations

- "This month" uses the local timezone of the machine running the bot.
- If the bot process dies between saving a transaction and replying, Telegram may redeliver the update on restart - a rare duplicate entry is possible.
- `/undo` is not atomic (fetch latest, then delete); fine for a single-user bot.
- The bot uses the Supabase service_role key, which bypasses row level security. Keep `.env` private and never commit it.
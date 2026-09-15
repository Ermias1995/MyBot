'use strict';

const supabase = require('./client');

const DEFAULT_CATEGORIES = [
  'Food',
  'Transport',
  'Rent',
  'Groceries',
  'Entertainment',
  'Health',
  'Bills',
  'Other',
];

const CATEGORY_ICONS = {
  Food: '🍽️',
  Transport: '🚌',
  Rent: '🏠',
  Groceries: '🛒',
  Entertainment: '🎬',
  Health: '💊',
  Bills: '💡',
  Other: '📦',
  Uncategorised: '❓',
};

const CURRENCY = 'ETB';
const RECENT_LIMIT = 10;

const iconFor = (name) => CATEGORY_ICONS[name] ?? '📦';
const round2 = (n) => Math.round(n * 100) / 100;

function localDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Registers the user if new and seeds default categories once.
 * Idempotent — safe on every message / request.
 */
async function ensureUser(telegramUser) {
  const { error } = await supabase.from('users').upsert(
    {
      telegram_id: telegramUser.id,
      first_name: telegramUser.first_name ?? null,
      username: telegramUser.username ?? null,
    },
    { onConflict: 'telegram_id' }
  );
  if (error) throw error;

  const categories = await listCategories(telegramUser.id);
  if (categories.length === 0) {
    const rows = DEFAULT_CATEGORIES.map((name) => ({
      user_id: telegramUser.id,
      name,
      is_default: true,
    }));
    const { error: seedError } = await supabase.from('categories').insert(rows);
    if (seedError) throw seedError;
    return listCategories(telegramUser.id);
  }
  return categories;
}

async function listCategories(telegramId) {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name')
    .eq('user_id', telegramId)
    .order('id', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function addTransaction({ telegramId, categoryId, amount, note }) {
  const { data, error } = await supabase
    .from('transactions')
    .insert({
      user_id: telegramId,
      category_id: categoryId ?? null,
      amount,
      note,
    })
    .select('id, amount, note, category_id, spent_at')
    .single();
  if (error) throw error;
  return data;
}

async function updateTransactionCategory(telegramId, transactionId, categoryId) {
  const { data, error } = await supabase
    .from('transactions')
    .update({ category_id: categoryId })
    .eq('id', transactionId)
    .eq('user_id', telegramId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function deleteLastTransaction(telegramId) {
  const { data: latest, error: fetchError } = await supabase
    .from('transactions')
    .select('id, amount, note')
    .eq('user_id', telegramId)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!latest) return null;

  const { error: deleteError } = await supabase
    .from('transactions')
    .delete()
    .eq('id', latest.id)
    .eq('user_id', telegramId);
  if (deleteError) throw deleteError;
  return latest;
}

async function getMonthlySummary(telegramId) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const { data, error } = await supabase
    .from('transactions')
    .select('amount, categories(name)')
    .eq('user_id', telegramId)
    .gte('spent_at', monthStart.toISOString())
    .lt('spent_at', nextMonthStart.toISOString());
  if (error) throw error;

  const totals = new Map();
  let grand = 0;
  for (const row of data ?? []) {
    const name = row.categories ? row.categories.name : 'Uncategorised';
    const value = Number(row.amount);
    totals.set(name, (totals.get(name) ?? 0) + value);
    grand += value;
  }

  return {
    total: grand,
    byCategory: [...totals.entries()]
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total),
  };
}

/**
 * Payload for GET /api/dashboard (Mini App home screen).
 */
async function getDashboard(telegramUser) {
  await ensureUser(telegramUser);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const { data: monthRows, error: monthError } = await supabase
    .from('transactions')
    .select('amount, categories(name)')
    .eq('user_id', telegramUser.id)
    .gte('spent_at', monthStart.toISOString())
    .lt('spent_at', nextMonthStart.toISOString());
  if (monthError) throw monthError;

  const totals = new Map();
  let monthTotal = 0;
  for (const row of monthRows ?? []) {
    const name = row.categories ? row.categories.name : 'Uncategorised';
    const value = Number(row.amount);
    totals.set(name, (totals.get(name) ?? 0) + value);
    monthTotal += value;
  }

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    days.push({ date: localDateKey(day), amount: 0 });
  }
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
  const { data: weekRows, error: weekError } = await supabase
    .from('transactions')
    .select('amount, spent_at')
    .eq('user_id', telegramUser.id)
    .gte('spent_at', weekStart.toISOString());
  if (weekError) throw weekError;

  const byDay = new Map(days.map((d) => [d.date, d]));
  for (const row of weekRows ?? []) {
    const day = byDay.get(localDateKey(new Date(row.spent_at)));
    if (day) day.amount = round2(day.amount + Number(row.amount));
  }

  const { data: recent, error: recentError } = await supabase
    .from('transactions')
    .select('id, amount, note, spent_at, categories(name)')
    .eq('user_id', telegramUser.id)
    .order('id', { ascending: false })
    .limit(RECENT_LIMIT);
  if (recentError) throw recentError;

  return {
    currency: CURRENCY,
    monthTotal: round2(monthTotal),
    byCategory: [...totals.entries()]
      .map(([name, amount]) => ({ name, icon: iconFor(name), amount: round2(amount) }))
      .sort((a, b) => b.amount - a.amount),
    last7Days: days,
    recentTransactions: (recent ?? []).map((row) => ({
      id: row.id,
      amount: round2(Number(row.amount)),
      note: row.note,
      category: row.categories ? row.categories.name : null,
      occurred_at: row.spent_at,
    })),
  };
}

module.exports = {
  DEFAULT_CATEGORIES,
  CATEGORY_ICONS,
  ensureUser,
  listCategories,
  addTransaction,
  updateTransactionCategory,
  deleteLastTransaction,
  getMonthlySummary,
  getDashboard,
};

// All database access lives here, so bot.js never talks to Supabase directly.
const supabase = require('./supabaseClient');

// Seeded for every new user. Keep these names in sync with the keyword map
// in src/parsers/manualParser.js (guessCategory matches against them).
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

/**
 * Registers the user if new and seeds default categories once.
 * Idempotent - safe to call on every message. Returns the user's categories.
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

/**
 * Inserts a transaction. categoryId may be null when the category is not
 * known yet. Returns the created row, including its id (needed for buttons).
 */
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

/**
 * Re-points one transaction at a different category. Scoped by user so no one
 * can update someone else's transaction. Returns { id } or null when the row
 * does not exist / belongs to someone else.
 */
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

/**
 * Deletes the most recent transaction and returns it, or null when the user
 * has none. Fetch-then-delete is not atomic, but is fine for a single user.
 */
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

/**
 * Total spend for the current calendar month, grouped by category.
 * Uses the machine's local timezone for the month boundary.
 * Returns { total, byCategory: [{ category, total }] } sorted high to low.
 */
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
    // Rows saved before a category was picked show up as "Uncategorised".
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

module.exports = {
  DEFAULT_CATEGORIES,
  ensureUser,
  listCategories,
  addTransaction,
  updateTransactionCategory,
  deleteLastTransaction,
  getMonthlySummary,
};
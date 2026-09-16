'use strict';

const supabase = require('./client');
const {
  CURRENCY,
  RECENT_LIMIT,
  MAX_LIST_LIMIT,
  ACCOUNTS,
  CATEGORY_ICONS,
  iconFor,
  round2,
  normalizeAccount,
  budgetStatus,
  localDateKey,
  toMonthStart,
  monthBoundsFromStart,
  mapTransaction,
  mapBudget,
} = require('./helpers');

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

const TX_SELECT =
  'id, amount, note, account, category_id, spent_at, created_at, categories(name)';
const BUDGET_SELECT =
  'id, amount, month_start, category_id, created_at, updated_at, categories(name)';

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
    .select('id, name, is_default')
    .eq('user_id', telegramId)
    .order('id', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    is_default: c.is_default,
    icon: iconFor(c.name),
  }));
}

async function getCategoryForUser(telegramId, categoryId) {
  if (categoryId == null) return null;
  const { data, error } = await supabase
    .from('categories')
    .select('id, name')
    .eq('user_id', telegramId)
    .eq('id', categoryId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function addTransaction({ telegramId, categoryId, amount, note, spentAt, account }) {
  if (categoryId != null) {
    const cat = await getCategoryForUser(telegramId, categoryId);
    if (!cat) {
      const err = new Error('Category not found.');
      err.status = 400;
      throw err;
    }
  }

  const row = {
    user_id: telegramId,
    category_id: categoryId ?? null,
    amount,
    note: note ?? '',
    account: normalizeAccount(account),
  };
  if (spentAt) row.spent_at = spentAt;

  const { data, error } = await supabase
    .from('transactions')
    .insert(row)
    .select(TX_SELECT)
    .single();
  if (error) throw error;
  return mapTransaction(data);
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

async function listTransactions(telegramId, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 20, 1), MAX_LIST_LIMIT);
  const offset = Math.max(Number(opts.offset) || 0, 0);

  let query = supabase
    .from('transactions')
    .select(TX_SELECT, { count: 'exact' })
    .eq('user_id', telegramId)
    .order('spent_at', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + limit - 1);

  if (opts.from) query = query.gte('spent_at', new Date(opts.from).toISOString());
  if (opts.to) query = query.lt('spent_at', new Date(opts.to).toISOString());
  if (opts.categoryId != null) query = query.eq('category_id', opts.categoryId);
  if (opts.account) query = query.eq('account', normalizeAccount(opts.account));
  if (opts.q) {
    const term = String(opts.q).trim().replace(/[%_,]/g, '');
    if (term) query = query.ilike('note', `%${term}%`);
  }

  const { data, error, count } = await query;
  if (error) throw error;

  return {
    currency: CURRENCY,
    items: (data ?? []).map(mapTransaction),
    total: count ?? 0,
    limit,
    offset,
  };
}

async function getTransaction(telegramId, transactionId) {
  const { data, error } = await supabase
    .from('transactions')
    .select(TX_SELECT)
    .eq('user_id', telegramId)
    .eq('id', transactionId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapTransaction(data) : null;
}

async function updateTransaction(telegramId, transactionId, patch) {
  const updates = {};
  if (patch.amount != null) updates.amount = patch.amount;
  if (patch.note != null) updates.note = patch.note;
  if (patch.spentAt != null) updates.spent_at = patch.spentAt;
  if (Object.prototype.hasOwnProperty.call(patch, 'account')) {
    updates.account = normalizeAccount(patch.account);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'categoryId')) {
    if (patch.categoryId != null) {
      const cat = await getCategoryForUser(telegramId, patch.categoryId);
      if (!cat) {
        const err = new Error('Category not found.');
        err.status = 400;
        throw err;
      }
    }
    updates.category_id = patch.categoryId;
  }

  if (Object.keys(updates).length === 0) {
    return getTransaction(telegramId, transactionId);
  }

  const { data, error } = await supabase
    .from('transactions')
    .update(updates)
    .eq('user_id', telegramId)
    .eq('id', transactionId)
    .select(TX_SELECT)
    .maybeSingle();
  if (error) throw error;
  return data ? mapTransaction(data) : null;
}

async function deleteTransaction(telegramId, transactionId) {
  const existing = await getTransaction(telegramId, transactionId);
  if (!existing) return null;

  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('user_id', telegramId)
    .eq('id', transactionId);
  if (error) throw error;
  return existing;
}

async function listBudgets(telegramId, { month } = {}) {
  let query = supabase
    .from('budgets')
    .select(BUDGET_SELECT)
    .eq('user_id', telegramId)
    .order('month_start', { ascending: false })
    .order('id', { ascending: true });

  if (month) {
    query = query.eq('month_start', toMonthStart(month));
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(mapBudget);
}

async function getBudget(telegramId, budgetId) {
  const { data, error } = await supabase
    .from('budgets')
    .select(BUDGET_SELECT)
    .eq('user_id', telegramId)
    .eq('id', budgetId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapBudget(data) : null;
}

/**
 * Create or replace a budget for (user, month, category?).
 * categoryId null = overall monthly budget.
 */
async function upsertBudget({ telegramId, amount, month, categoryId = null }) {
  const monthStart = toMonthStart(month);

  if (categoryId != null) {
    const cat = await getCategoryForUser(telegramId, categoryId);
    if (!cat) {
      const err = new Error('Category not found.');
      err.status = 400;
      throw err;
    }
  }

  let existingQuery = supabase
    .from('budgets')
    .select('id')
    .eq('user_id', telegramId)
    .eq('month_start', monthStart);

  existingQuery =
    categoryId == null
      ? existingQuery.is('category_id', null)
      : existingQuery.eq('category_id', categoryId);

  const { data: existing, error: findError } = await existingQuery.maybeSingle();
  if (findError) throw findError;

  const now = new Date().toISOString();

  if (existing) {
    const { data, error } = await supabase
      .from('budgets')
      .update({ amount, updated_at: now })
      .eq('id', existing.id)
      .eq('user_id', telegramId)
      .select(BUDGET_SELECT)
      .single();
    if (error) throw error;
    return mapBudget(data);
  }

  const { data, error } = await supabase
    .from('budgets')
    .insert({
      user_id: telegramId,
      category_id: categoryId,
      amount,
      month_start: monthStart,
      updated_at: now,
    })
    .select(BUDGET_SELECT)
    .single();
  if (error) throw error;
  return mapBudget(data);
}

async function updateBudget(telegramId, budgetId, { amount }) {
  const { data, error } = await supabase
    .from('budgets')
    .update({ amount, updated_at: new Date().toISOString() })
    .eq('user_id', telegramId)
    .eq('id', budgetId)
    .select(BUDGET_SELECT)
    .maybeSingle();
  if (error) throw error;
  return data ? mapBudget(data) : null;
}

async function deleteBudget(telegramId, budgetId) {
  const existing = await getBudget(telegramId, budgetId);
  if (!existing) return null;

  const { error } = await supabase
    .from('budgets')
    .delete()
    .eq('user_id', telegramId)
    .eq('id', budgetId);
  if (error) throw error;
  return existing;
}

/**
 * Budget vs spend for a month (overall + per category).
 */
async function getBudgetSummary(telegramId, month) {
  const monthStart = toMonthStart(month);
  const { start, end } = monthBoundsFromStart(monthStart);

  const budgets = await listBudgets(telegramId, { month: monthStart });

  const { data: rows, error } = await supabase
    .from('transactions')
    .select('amount, category_id, categories(name)')
    .eq('user_id', telegramId)
    .gte('spent_at', start.toISOString())
    .lt('spent_at', end.toISOString());
  if (error) throw error;

  let monthTotal = 0;
  const spentByCategoryId = new Map();
  for (const row of rows ?? []) {
    const value = Number(row.amount);
    monthTotal += value;
    if (row.category_id != null) {
      spentByCategoryId.set(
        row.category_id,
        (spentByCategoryId.get(row.category_id) ?? 0) + value
      );
    }
  }
  monthTotal = round2(monthTotal);

  const overall = budgets.find((b) => b.category_id == null) ?? null;
  const categoryBudgets = budgets.filter((b) => b.category_id != null);

  const categories = categoryBudgets.map((b) => {
    const spent = round2(spentByCategoryId.get(b.category_id) ?? 0);
    const status = budgetStatus(spent, b.amount);
    return {
      ...b,
      spent,
      limit: b.amount,
      remaining: status.remaining,
      progress: Math.min(1, status.progress),
      status: status.status,
      status_text: status.status_text,
      over_by: status.over_by ?? 0,
    };
  });

  // Prefer sum of category limits for "Total Allocated"; else overall monthly budget.
  const allocatedLimit = categories.length
    ? round2(categories.reduce((s, c) => s + c.amount, 0))
    : overall
      ? overall.amount
      : 0;
  const allocatedSpent = categories.length
    ? round2(categories.reduce((s, c) => s + c.spent, 0))
    : monthTotal;
  const allocatedStatus = budgetStatus(allocatedSpent, allocatedLimit || 0);

  const overallSpent = monthTotal;
  const budgetLeft =
    overall != null ? round2(Math.max(0, overall.amount - overallSpent)) : null;

  return {
    currency: CURRENCY,
    month: monthStart.slice(0, 7),
    monthTotal,
    total_allocated: allocatedSpent,
    total_limit: allocatedLimit,
    category_count: categories.length,
    remaining: allocatedStatus.remaining ?? round2(allocatedLimit - allocatedSpent),
    utilized: allocatedLimit > 0 ? round2(Math.min(1, allocatedSpent / allocatedLimit)) : 0,
    overall: overall
      ? {
          ...overall,
          spent: overallSpent,
          remaining: round2(overall.amount - overallSpent),
          progress: overall.amount > 0 ? round2(Math.min(1, overallSpent / overall.amount)) : 0,
          ...budgetStatus(overallSpent, overall.amount),
        }
      : null,
    budgetLeft,
    categories,
  };
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

async function getDashboard(telegramUser) {
  await ensureUser(telegramUser);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const monthKey = toMonthStart(now);

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
  monthTotal = round2(monthTotal);

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
    .select(TX_SELECT)
    .eq('user_id', telegramUser.id)
    .order('id', { ascending: false })
    .limit(RECENT_LIMIT);
  if (recentError) throw recentError;

  let budgetLeft = null;
  let budgetTotal = null;
  try {
    const summary = await getBudgetSummary(telegramUser.id, monthKey);
    budgetLeft = summary.budgetLeft;
    budgetTotal = summary.overall ? summary.overall.amount : null;
  } catch (err) {
    // Budgets table may not exist until migration is applied — dashboard still works.
    if (err?.code !== '42P01' && err?.code !== 'PGRST205') throw err;
  }

  return {
    currency: CURRENCY,
    monthTotal,
    budgetLeft,
    budgetTotal,
    byCategory: [...totals.entries()]
      .map(([name, amount]) => ({ name, icon: iconFor(name), amount: round2(amount) }))
      .sort((a, b) => b.amount - a.amount),
    last7Days: days,
    recentTransactions: (recent ?? []).map(mapTransaction),
  };
}

module.exports = {
  DEFAULT_CATEGORIES,
  CATEGORY_ICONS,
  ACCOUNTS,
  CURRENCY,
  ensureUser,
  listCategories,
  addTransaction,
  updateTransactionCategory,
  deleteLastTransaction,
  listTransactions,
  getTransaction,
  updateTransaction,
  deleteTransaction,
  listBudgets,
  getBudget,
  upsertBudget,
  updateBudget,
  deleteBudget,
  getBudgetSummary,
  getMonthlySummary,
  getDashboard,
};

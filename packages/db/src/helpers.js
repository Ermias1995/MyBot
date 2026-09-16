'use strict';

const CURRENCY = 'ETB';
const RECENT_LIMIT = 10;
const MAX_LIST_LIMIT = 100;

const ACCOUNTS = [
  { id: 'Telebirr', label: 'Telebirr', display: 'Telebirr Wallet' },
  { id: 'CBE', label: 'CBE', display: 'CBE Account' },
  { id: 'Cash', label: 'Cash', display: 'Cash' },
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

const iconFor = (name) => CATEGORY_ICONS[name] ?? '📦';
const round2 = (n) => Math.round(Number(n) * 100) / 100;

function accountDisplay(account) {
  const found = ACCOUNTS.find((a) => a.id === account);
  return found ? found.display : account || 'Cash';
}

function normalizeAccount(value) {
  if (value == null || value === '') return 'Cash';
  const match = ACCOUNTS.find(
    (a) =>
      a.id.toLowerCase() === String(value).toLowerCase() ||
      a.label.toLowerCase() === String(value).toLowerCase()
  );
  if (!match) {
    const err = new Error('account must be Telebirr, CBE, or Cash.');
    err.status = 400;
    throw err;
  }
  return match.id;
}

function budgetStatus(spent, limit) {
  if (!limit || limit <= 0) {
    return { status: 'none', status_text: 'No limit', progress: 0 };
  }
  const progress = round2(spent / limit);
  const remaining = round2(limit - spent);
  if (progress > 1) {
    return {
      status: 'danger',
      status_text: 'Over budget',
      progress: round2(Math.min(progress, 2)),
      over_by: round2(spent - limit),
      remaining,
    };
  }
  if (progress >= 0.9) {
    return { status: 'warn', status_text: 'Near threshold', progress, remaining };
  }
  if (progress >= 0.7) {
    return { status: 'ok', status_text: 'On pace', progress, remaining };
  }
  if (progress >= 0.4) {
    return {
      status: 'ok',
      status_text: `${Math.round(progress * 100)}% consumed`,
      progress,
      remaining,
    };
  }
  return { status: 'ok', status_text: 'Well managed', progress, remaining };
}

function localDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toMonthStart(input) {
  let d;
  if (!input) {
    d = new Date();
  } else if (/^\d{4}-\d{2}$/.test(input)) {
    const [y, m] = input.split('-').map(Number);
    d = new Date(y, m - 1, 1);
  } else if (/^\d{4}-\d{2}-\d{2}/.test(String(input))) {
    const raw = String(input).slice(0, 10);
    const [y, m] = raw.split('-').map(Number);
    d = new Date(y, m - 1, 1);
  } else {
    d = new Date(input);
  }
  if (!Number.isFinite(d.getTime())) {
    const err = new Error('Invalid month.');
    err.status = 400;
    throw err;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function monthBoundsFromStart(monthStart) {
  const [y, m] = monthStart.split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);
  return { start, end, monthStart };
}

function mapTransaction(row) {
  const account = row.account || 'Cash';
  return {
    id: row.id,
    amount: round2(row.amount),
    note: row.note ?? '',
    account,
    account_label: accountDisplay(account),
    category_id: row.category_id ?? null,
    category: row.categories ? row.categories.name : null,
    category_icon: row.categories ? iconFor(row.categories.name) : iconFor('Uncategorised'),
    occurred_at: row.spent_at,
    created_at: row.created_at ?? undefined,
  };
}

function mapBudget(row) {
  return {
    id: row.id,
    amount: round2(row.amount),
    month: row.month_start.slice(0, 7),
    month_start: row.month_start,
    category_id: row.category_id ?? null,
    category: row.categories ? row.categories.name : null,
    category_icon: row.categories ? iconFor(row.categories.name) : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

module.exports = {
  CURRENCY,
  RECENT_LIMIT,
  MAX_LIST_LIMIT,
  ACCOUNTS,
  CATEGORY_ICONS,
  iconFor,
  round2,
  accountDisplay,
  normalizeAccount,
  budgetStatus,
  localDateKey,
  toMonthStart,
  monthBoundsFromStart,
  mapTransaction,
  mapBudget,
};

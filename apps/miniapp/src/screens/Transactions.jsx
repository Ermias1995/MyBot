import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import {
  currentMonthKey,
  formatAmount,
  groupHeader,
  monthBounds,
  monthLabel,
} from '../lib/format';
import { backButton, mainButton } from '../lib/telegram';

function dayKey(iso) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function Transactions({ onClose, onAdd }) {
  const [month, setMonth] = useState(() => currentMonthKey());
  const [categoryId, setCategoryId] = useState('');
  const [categories, setCategories] = useState([]);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState([]);
  const [currency, setCurrency] = useState('ETB');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    api('/categories')
      .then((body) => setCategories(body.items ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { from, to } = monthBounds(month);
        const params = new URLSearchParams({
          from,
          to,
          limit: '100',
        });
        if (categoryId) params.set('categoryId', categoryId);
        if (search) params.set('q', search);
        const body = await api(`/transactions?${params}`);
        if (!cancelled) {
          setItems(body.items ?? []);
          setCurrency(body.currency ?? 'ETB');
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [month, categoryId, search]);

  useEffect(() => {
    const onBack = () => onClose?.();
    backButton.show(onBack);
    return () => backButton.hide(onBack);
  }, [onClose]);

  useEffect(() => {
    const goAdd = () => onAdd?.();
    mainButton.show('Add Expense', goAdd);
    return () => mainButton.hide(goAdd);
  }, [onAdd]);

  const groups = useMemo(() => {
    const map = new Map();
    for (const tx of items) {
      const key = dayKey(tx.occurred_at);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(tx);
    }
    return [...map.entries()].map(([key, txs]) => ({
      key,
      label: groupHeader(txs[0].occurred_at),
      total: txs.reduce((s, t) => s + Number(t.amount), 0),
      items: txs,
    }));
  }, [items]);

  const monthOptions = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return { key, label: monthLabel(key) };
    });
  }, []);

  return (
    <div className="min-h-screen bg-tg-bg px-4 pb-20 pt-3 text-tg-text">
      <div className="mb-1 flex items-start justify-between gap-3">
        <h1 className="text-2xl font-bold">Transactions</h1>
        <p className="pt-1 text-sm text-tg-hint">{monthLabel(month)}</p>
      </div>
      <p className="text-sm text-tg-hint">Track your daily cashflow and payment channels</p>

      <label className="mt-4 flex items-center gap-2 rounded-2xl bg-tg-secondary px-3 py-3">
        <span className="text-tg-hint">⌕</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search expenses..."
          className="w-full bg-transparent text-sm outline-none placeholder:text-tg-hint"
        />
      </label>

      <div className="mt-3 flex items-center gap-2">
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="rounded-full bg-tg-secondary px-3 py-2 text-xs font-semibold outline-none"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-full bg-tg-secondary px-3 py-2 text-xs font-semibold outline-none"
        >
          {monthOptions.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label.split(' ')[0]}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="mt-3 text-sm text-tg-hint">{error}</p>}
      {loading && <p className="mt-6 text-center text-sm text-tg-hint">Loading…</p>}

      <div className="mt-5 space-y-5">
        {!loading && groups.length === 0 && (
          <p className="rounded-2xl bg-tg-secondary p-4 text-center text-sm text-tg-hint">
            No transactions for this filter.
          </p>
        )}
        {groups.map((g) => (
          <section key={g.key}>
            <div className="mb-2 flex items-center justify-between px-0.5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-tg-hint">
                {g.label}
              </p>
              <p className="text-sm font-bold tabular-nums">
                {formatAmount(g.total)} {currency}
              </p>
            </div>
            <ul className="overflow-hidden rounded-2xl bg-tg-secondary">
              {g.items.map((tx, i) => (
                <li
                  key={tx.id}
                  className={`flex items-center gap-3 px-3 py-3 ${
                    i < g.items.length - 1 ? 'border-b border-tg-bg' : ''
                  }`}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-tg-bg text-base">
                    {tx.category_icon ?? '❓'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{tx.note || 'Expense'}</p>
                    <p className="truncate text-xs text-tg-hint">
                      {tx.category ?? 'Uncategorised'} · {tx.account_label || tx.account || 'Cash'}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-bold tabular-nums">
                    -{formatAmount(tx.amount)} {currency}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

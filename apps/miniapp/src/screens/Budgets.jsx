import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import {
  currentMonthKey,
  formatAmountPlain,
  monthLabel,
} from '../lib/format';
import { backButton, haptic, mainButton } from '../lib/telegram';

function statusBarClass(status) {
  if (status === 'danger') return 'bg-tg-hint';
  if (status === 'warn') return 'bg-tg-button opacity-80';
  return 'bg-tg-button';
}

export default function Budgets({ onClose }) {
  const [month] = useState(() => currentMonthKey());
  const [summary, setSummary] = useState(null);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formCategoryId, setFormCategoryId] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [sum, cats] = await Promise.all([
        api(`/budgets/summary?month=${month}`),
        api('/categories'),
      ]);
      setSummary(sum);
      setCategories(cats.items ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [month]);

  useEffect(() => {
    const onBack = () => (showForm ? setShowForm(false) : onClose?.());
    backButton.show(onBack);
    return () => backButton.hide(onBack);
  }, [onClose, showForm]);

  useEffect(() => {
    if (showForm) {
      mainButton.hide();
      return undefined;
    }
    const onAdd = () => setShowForm(true);
    mainButton.show('Set a budget', onAdd);
    return () => mainButton.hide(onAdd);
  }, [showForm]);

  const items = summary?.categories ?? [];
  const utilizedPct = Math.round((summary?.utilized ?? 0) * 100);

  const unusedCategories = useMemo(() => {
    const used = new Set(items.map((i) => i.category_id));
    return categories.filter((c) => !used.has(c.id));
  }, [categories, items]);

  async function saveBudget(e) {
    e.preventDefault();
    const amount = Number(formAmount);
    if (!formCategoryId || !(amount > 0)) return;
    setSaving(true);
    try {
      await api('/budgets', {
        method: 'POST',
        body: {
          amount,
          month,
          categoryId: Number(formCategoryId),
        },
      });
      haptic('medium');
      setShowForm(false);
      setFormAmount('');
      setFormCategoryId('');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-tg-bg px-4 pb-20 pt-3 text-tg-text">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Budgets</h1>
          <p className="mt-0.5 text-sm text-tg-hint">{monthLabel(month)}</p>
        </div>
        <span className="rounded-full bg-tg-secondary px-3 py-1.5 text-xs font-semibold">
          Monthly ▾
        </span>
      </div>

      {error && <p className="mb-3 text-sm text-tg-hint">{error}</p>}

      <div className="rounded-2xl bg-tg-secondary p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">Total Allocated</p>
            <span className="rounded-full bg-tg-bg px-2 py-0.5 text-[11px] font-semibold text-tg-button">
              {summary?.category_count ?? 0} categories
            </span>
          </div>
          <p className="text-sm font-bold tabular-nums">
            {formatAmountPlain(summary?.total_allocated ?? 0)} /{' '}
            {formatAmountPlain(summary?.total_limit ?? 0)} ETB
          </p>
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-tg-bg">
          <div
            className="h-full rounded-full bg-tg-button"
            style={{ width: `${Math.min(100, utilizedPct)}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs">
          <p className="text-tg-hint">
            ✓ {formatAmountPlain(Math.max(0, summary?.remaining ?? 0))} ETB remaining
          </p>
          <p className="font-semibold text-tg-button">{utilizedPct}% utilized</p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {loading && <p className="text-center text-sm text-tg-hint">Loading…</p>}
        {!loading && items.length === 0 && (
          <p className="rounded-2xl bg-tg-secondary p-4 text-center text-sm text-tg-hint">
            No category budgets yet. Tap “Set a budget” to add one.
          </p>
        )}
        {items.map((b) => {
          const pct = Math.round((b.progress ?? 0) * 100);
          const over = b.status === 'danger';
          return (
            <div key={b.id} className="rounded-2xl bg-tg-secondary p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-tg-bg text-lg">
                  {b.category_icon ?? '📦'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-semibold">
                        <span className="truncate">{b.category}</span>
                        {over && (
                          <span className="rounded-full bg-tg-bg px-2 py-0.5 text-[11px] font-bold text-tg-hint">
                            +{formatAmountPlain(b.over_by)} ETB
                          </span>
                        )}
                      </p>
                      <p className={`mt-0.5 text-xs ${over ? 'font-semibold text-tg-hint' : 'text-tg-hint'}`}>
                        {b.status_text}
                      </p>
                    </div>
                    <p className={`shrink-0 text-sm font-bold tabular-nums ${over ? 'text-tg-hint' : ''}`}>
                      {formatAmountPlain(b.spent)} / {formatAmountPlain(b.limit)} ETB
                    </p>
                  </div>
                  <p className={`mt-1 text-xs ${over ? 'text-tg-hint' : 'text-tg-hint'}`}>
                    {over
                      ? `Exceeded by ${formatAmountPlain(b.over_by)} ETB`
                      : `${formatAmountPlain(Math.max(0, b.remaining))} ETB left`}
                  </p>
                  <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-tg-bg">
                    <div
                      className={`h-full rounded-full ${statusBarClass(b.status)}`}
                      style={{ width: `${Math.min(100, over ? 100 : pct)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setShowForm(true)}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-tg-secondary py-3.5 text-sm font-semibold text-tg-button"
      >
        <span className="text-lg leading-none">+</span> Set a budget
      </button>

      {showForm && (
        <div className="fixed inset-0 z-20 flex items-end bg-black/40 p-4">
          <form
            onSubmit={saveBudget}
            className="w-full rounded-2xl bg-tg-bg p-4 text-tg-text shadow-lg"
          >
            <h2 className="text-lg font-bold">Set a budget</h2>
            <p className="mt-1 text-sm text-tg-hint">{monthLabel(month)}</p>

            <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-tg-hint">
              Category
            </label>
            <select
              value={formCategoryId}
              onChange={(e) => setFormCategoryId(e.target.value)}
              className="mt-1 w-full rounded-xl bg-tg-secondary px-3 py-3 text-sm outline-none"
              required
            >
              <option value="">Select category</option>
              {(unusedCategories.length ? unusedCategories : categories).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>

            <label className="mt-3 block text-xs font-medium uppercase tracking-wide text-tg-hint">
              Monthly limit (ETB)
            </label>
            <input
              inputMode="decimal"
              value={formAmount}
              onChange={(e) => setFormAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="6000"
              className="mt-1 w-full rounded-xl bg-tg-secondary px-3 py-3 text-sm outline-none"
              required
            />

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex-1 rounded-xl bg-tg-secondary py-3 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 rounded-xl bg-tg-button py-3 text-sm font-semibold text-tg-button-text disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { formatAmount, formatDateTimeLabel, toDatetimeLocalValue } from '../lib/format';
import { backButton, haptic, mainButton } from '../lib/telegram';

const QUICK = [50, 100, 500];

export default function AddExpense({ onClose, onSaved }) {
  const [categories, setCategories] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState(null);
  const [account, setAccount] = useState('Telebirr');
  const [note, setNote] = useState('');
  const [spentAt, setSpentAt] = useState(() => new Date());
  const [budgetHint, setBudgetHint] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const dateRef = useRef(null);
  const amountNum = Number(amount) || 0;

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === categoryId) ?? null,
    [categories, categoryId]
  );

  const accountDisplay =
    accounts.find((a) => a.id === account)?.display ?? account;

  useEffect(() => {
    const onBack = () => onClose?.();
    backButton.show(onBack);
    return () => backButton.hide(onBack);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [cats, accs] = await Promise.all([api('/categories'), api('/accounts')]);
        if (cancelled) return;
        setCategories(cats.items ?? []);
        setAccounts(accs.items ?? []);
        if (!categoryId && cats.items?.[0]) setCategoryId(cats.items[0].id);
        if (accs.items?.[0]) setAccount(accs.items[0].id);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!categoryId) {
      setBudgetHint(null);
      return;
    }
    let cancelled = false;
    async function loadBudget() {
      try {
        const summary = await api('/budgets/summary');
        if (cancelled) return;
        const match = (summary.categories ?? []).find((c) => c.category_id === categoryId);
        setBudgetHint(match ?? null);
      } catch {
        if (!cancelled) setBudgetHint(null);
      }
    }
    loadBudget();
    return () => {
      cancelled = true;
    };
  }, [categoryId]);

  useEffect(() => {
    const canSave = amountNum > 0 && categoryId != null && !saving;
    const onSave = async () => {
      if (!canSave) return;
      setSaving(true);
      setError(null);
      mainButton.showProgress();
      try {
        await api('/transactions', {
          method: 'POST',
          body: {
            amount: amountNum,
            categoryId,
            account,
            note,
            spentAt: spentAt.toISOString(),
          },
        });
        haptic('medium');
        onSaved?.();
        onClose?.();
      } catch (err) {
        setError(err.message);
        haptic('heavy');
      } finally {
        mainButton.hideProgress();
        setSaving(false);
      }
    };

    mainButton.show('Save Expense', onSave);
    if (canSave) mainButton.enable();
    else mainButton.disable();

    return () => mainButton.hide(onSave);
  }, [amountNum, categoryId, account, note, spentAt, saving, onClose, onSaved]);

  function bump(delta) {
    setAmount(String(Math.round((amountNum + delta) * 100) / 100));
  }

  const projectedSpent = (budgetHint?.spent ?? 0) + amountNum;
  const budgetPct =
    budgetHint?.limit > 0 ? Math.min(999, Math.round((projectedSpent / budgetHint.limit) * 100)) : null;

  return (
    <div className="min-h-screen bg-tg-bg px-4 pb-20 pt-3 text-tg-text">
      <header className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-tg-secondary text-lg"
          aria-label="Close"
        >
          ✕
        </button>
        <h1 className="text-base font-semibold">Add Expense</h1>
        <button
          type="button"
          onClick={() => alert('Receipt scan coming soon.')}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-tg-secondary text-lg"
          aria-label="Scan"
        >
          ▦
        </button>
      </header>

      <p className="text-[11px] font-medium uppercase tracking-wide text-tg-hint">
        Ethiopian Birr
      </p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-xl font-semibold text-tg-hint">ETB</span>
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
          placeholder="0.00"
          className="w-full bg-transparent text-[34px] font-bold outline-none placeholder:text-tg-hint"
        />
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {QUICK.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => bump(n)}
            className="shrink-0 rounded-full bg-tg-secondary px-4 py-2 text-sm font-semibold"
          >
            +{n}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setAmount('')}
          className="shrink-0 rounded-full bg-tg-secondary px-4 py-2 text-sm font-semibold"
        >
          C
        </button>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wide text-tg-hint">Category</p>
        <p className="text-xs text-tg-hint">Required</p>
      </div>
      <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1">
        {categories.map((c) => {
          const selected = c.id === categoryId;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategoryId(c.id)}
              className={`flex shrink-0 items-center gap-2 rounded-2xl px-3.5 py-2.5 text-sm font-semibold ${
                selected ? 'bg-tg-button text-tg-button-text' : 'bg-tg-secondary text-tg-text'
              }`}
            >
              <span aria-hidden>{c.icon}</span>
              {c.name}
            </button>
          );
        })}
      </div>

      <div className="mt-5 space-y-0 overflow-hidden rounded-2xl bg-tg-secondary">
        <button
          type="button"
          onClick={() => dateRef.current?.showPicker?.() || dateRef.current?.click()}
          className="flex w-full items-center gap-3 px-3.5 py-3.5 text-left"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-tg-bg text-tg-button">
            📅
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-tg-hint">Date & Time</span>
            <span className="block truncate text-sm font-semibold">
              {formatDateTimeLabel(spentAt.toISOString())}
            </span>
          </span>
          <span className="text-tg-hint">›</span>
          <input
            ref={dateRef}
            type="datetime-local"
            className="sr-only"
            value={toDatetimeLocalValue(spentAt)}
            onChange={(e) => setSpentAt(new Date(e.target.value))}
          />
        </button>

        <div className="mx-3.5 border-t border-tg-bg" />

        <div className="flex items-center gap-3 px-3.5 py-3.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-tg-bg">💳</span>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-tg-hint">Account</p>
            <p className="truncate text-sm font-semibold">{accountDisplay}</p>
          </div>
          <div className="flex rounded-full bg-tg-bg p-0.5">
            {(accounts.length ? accounts : [{ id: 'Telebirr' }, { id: 'CBE' }, { id: 'Cash' }]).map(
              (a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAccount(a.id)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    account === a.id ? 'bg-tg-secondary text-tg-text' : 'text-tg-hint'
                  }`}
                >
                  {a.label ?? a.id}
                </button>
              )
            )}
          </div>
        </div>

        <div className="mx-3.5 border-t border-tg-bg" />

        <div className="px-3.5 py-3">
          <label className="flex items-center gap-2 rounded-full bg-tg-bg px-3 py-2.5">
            <span className="text-tg-hint">✎</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What was this expense for?"
              className="w-full bg-transparent text-sm outline-none placeholder:text-tg-hint"
            />
          </label>
        </div>
      </div>

      {budgetHint && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-tg-secondary p-3.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-tg-bg text-lg">
            {selectedCategory?.icon ?? '📊'}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              Monthly {budgetHint.category || selectedCategory?.name} Budget
            </p>
            <p className="text-xs text-tg-hint">
              ETB {formatAmount(projectedSpent)} of ETB {formatAmount(budgetHint.limit)} used
            </p>
          </div>
          {budgetPct != null && (
            <p
              className={`text-sm font-bold ${
                budgetPct > 100 ? 'text-tg-hint' : 'text-tg-button'
              }`}
            >
              {budgetPct}%
            </p>
          )}
        </div>
      )}

      {error && <p className="mt-3 text-center text-sm text-tg-hint">{error}</p>}
    </div>
  );
}

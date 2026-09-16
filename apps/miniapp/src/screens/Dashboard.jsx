import { useEffect, useMemo, useState } from 'react';
import {
  Chart as ChartJS,
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';
import { api } from '../lib/api';
import { backButton, getWebApp, initTelegram, mainButton } from '../lib/telegram';

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const CATEGORY_ICONS = {
  Food: '🍽️',
  Transport: '🚌',
  Rent: '🏠',
  Groceries: '🛒',
  Entertainment: '🎬',
  Health: '💊',
  Bills: '💡',
  Other: '📦',
  Airtime: '📱',
  Utilities: '💡',
  Shopping: '🛍️',
};

/** Loading-only shape so the skeleton mirrors the mockup layout. */
const PLACEHOLDER = {
  currency: 'ETB',
  monthTotal: 0,
  budgetLeft: null,
  budgetTotal: null,
  byCategory: [],
  last7Days: Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return { date: d.toISOString().slice(0, 10), amount: 0 };
  }),
  recentTransactions: [],
};

/**
 * Resolve Tailwind/Telegram theme tokens to computed colors for Chart.js.
 * Canvas cannot use CSS variables directly — we sample them from the DOM.
 */
function readTheme() {
  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:fixed;left:-9999px;top:0;pointer-events:none;';
  document.body.appendChild(probe);

  const sample = (className, prop) => {
    probe.className = className;
    return getComputedStyle(probe)[prop];
  };

  const theme = {
    button: sample('bg-tg-button', 'backgroundColor'),
    hint: sample('text-tg-hint', 'color'),
    text: sample('text-tg-text', 'color'),
    secondary: sample('bg-tg-secondary', 'backgroundColor'),
  };

  document.body.removeChild(probe);
  return theme;
}

function parseColor(input) {
  const s = String(input).trim();
  const hex = s.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  const short = s.match(/^#([0-9a-f]{3})$/i);
  if (short) {
    const [r, g, b] = short[1].split('').map((c) => parseInt(c + c, 16));
    return { r, g, b };
  }
  const rgb = s.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (rgb) return { r: +rgb[1], g: +rgb[2], b: +rgb[3] };
  return null;
}

function withAlpha(color, alpha) {
  const parsed = parseColor(color);
  if (!parsed) return color;
  return `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${alpha})`;
}

/** Accent shades for donut slices — derived from button color only. */
function accentPalette(button, count) {
  const alphas = [1, 0.82, 0.68, 0.54, 0.42, 0.32, 0.24, 0.16];
  return Array.from({ length: count }, (_, i) => withAlpha(button, alphas[i % alphas.length]));
}

function formatMoney(amount, currency) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatCompact(amount) {
  if (amount >= 1000) {
    const k = amount / 1000;
    return `${k >= 10 ? Math.round(k) : k.toFixed(2).replace(/\.?0+$/, '')}k`;
  }
  return String(Math.round(amount * 100) / 100);
}

function formatAmountPlain(amount) {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function relativeTime(iso) {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) {
    const m = Math.floor(diffSec / 60);
    return `${m} ${m === 1 ? 'minute' : 'minutes'} ago`;
  }
  if (diffSec < 86400) {
    const h = Math.floor(diffSec / 3600);
    return `${h} ${h === 1 ? 'hour' : 'hours'} ago`;
  }
  if (diffSec < 172800) return 'Yesterday';
  const days = Math.floor(diffSec / 86400);
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function weekdayLabel(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'short' });
}

function currentMonthLabel() {
  return new Date().toLocaleDateString(undefined, { month: 'long' });
}

/** Draws Total + compact amount in the donut hole. */
const donutCenterPlugin = {
  id: 'donutCenter',
  afterDraw(chart, _args, opts) {
    const { totalLabel, totalValue, textColor, hintColor } = opts;
    if (totalValue == null) return;
    const { ctx, chartArea } = chart;
    if (!chartArea) return;
    const x = (chartArea.left + chartArea.right) / 2;
    const y = (chartArea.top + chartArea.bottom) / 2;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = hintColor;
    ctx.font = '500 12px system-ui, sans-serif';
    ctx.fillText(totalLabel, x, y - 12);
    ctx.fillStyle = textColor;
    ctx.font = '700 22px system-ui, sans-serif';
    ctx.fillText(totalValue, x, y + 10);
    ctx.restore();
  },
};

ChartJS.register(donutCenterPlugin);

export default function Dashboard({ onAdd, onBudgets, onTransactions }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [theme, setTheme] = useState(() =>
    typeof document !== 'undefined' ? readTheme() : { button: '', hint: '', text: '', secondary: '' }
  );

  useEffect(() => {
    initTelegram();
    backButton.hide();
    const handleAdd = () => onAdd?.();
    mainButton.show('Add Expense', handleAdd);

    const refreshTheme = () => setTheme(readTheme());
    refreshTheme();
    const webApp = getWebApp();
    webApp?.onEvent?.('themeChanged', refreshTheme);

    return () => {
      mainButton.hide(handleAdd);
      webApp?.offEvent?.('themeChanged', refreshTheme);
    };
  }, [onAdd]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const body = await api('/dashboard');
        if (!cancelled) setData(body);
      } catch (err) {
        if (!cancelled) setError(err);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const view = data ?? PLACEHOLDER;
  const topCategory = view.byCategory[0] ?? null;
  const weekAvg =
    view.last7Days.length > 0
      ? view.last7Days.reduce((s, d) => s + d.amount, 0) / view.last7Days.length
      : 0;
  const peakIdx = view.last7Days.reduce(
    (best, d, i, arr) => (d.amount > arr[best].amount ? i : best),
    0
  );

  const donutData = useMemo(
    () => ({
      labels: view.byCategory.map((c) => c.name),
      datasets: [
        {
          data: view.byCategory.length
            ? view.byCategory.map((c) => c.amount)
            : [1],
          backgroundColor: view.byCategory.length
            ? accentPalette(theme.button, view.byCategory.length)
            : [withAlpha(theme.hint, 0.25)],
          borderWidth: 0,
          hoverOffset: 2,
        },
      ],
    }),
    [view.byCategory, theme.button, theme.hint]
  );

  const barData = useMemo(() => {
    const amounts = view.last7Days.map((d) => d.amount);
    return {
      labels: view.last7Days.map((d) => weekdayLabel(d.date)),
      datasets: [
        {
          data: amounts,
          backgroundColor: amounts.map((_, i) =>
            i === peakIdx && amounts[peakIdx] > 0
              ? theme.button
              : withAlpha(theme.button, 0.28)
          ),
          borderRadius: 8,
          borderSkipped: false,
          maxBarThickness: 28,
        },
      ],
    };
  }, [view.last7Days, peakIdx, theme.button]);

  const donutOptions = useMemo(
    () => ({
      cutout: '72%',
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: view.byCategory.length > 0,
          callbacks: {
            label(ctx) {
              const v = ctx.raw ?? 0;
              return ` ${formatAmountPlain(v)} ${view.currency}`;
            },
          },
        },
        donutCenter: {
          totalLabel: 'Total',
          totalValue: formatCompact(view.monthTotal),
          textColor: theme.text,
          hintColor: theme.hint,
        },
      },
    }),
    [view.byCategory.length, view.monthTotal, view.currency, theme.text, theme.hint]
  );

  const barOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label(ctx) {
              return ` ${formatAmountPlain(ctx.raw ?? 0)} ${view.currency}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            color: (ctx) =>
              ctx.index === peakIdx && view.last7Days[peakIdx]?.amount > 0
                ? theme.button
                : theme.hint,
            font: (ctx) => ({
              size: 11,
              weight:
                ctx.index === peakIdx && view.last7Days[peakIdx]?.amount > 0 ? '700' : '500',
            }),
          },
        },
        y: {
          display: false,
          beginAtZero: true,
          grid: { display: false },
          border: { display: false },
        },
      },
    }),
    [peakIdx, view.last7Days, view.currency, theme.button, theme.hint]
  );

  if (error) {
    const outsideTelegram = /Missing X-Telegram-Init-Data/.test(error.message);
    return (
      <div className="min-h-screen bg-tg-bg px-4 pb-20 pt-4 text-tg-text">
        <p className="text-center font-medium">Could not load the dashboard.</p>
        <p className="mt-2 text-center text-sm text-tg-hint">{error.message}</p>
        {outsideTelegram && (
          <p className="mt-4 text-center text-sm text-tg-hint">
            Tip: open this page inside Telegram — a plain browser has no initData.
          </p>
        )}
      </div>
    );
  }

  const loading = !data;

  return (
    <div className="min-h-screen bg-tg-bg px-4 pb-20 pt-3 text-tg-text">
      {/* Month + hero total */}
      <button
        type="button"
        className="mb-1 flex items-center gap-1 text-[15px] font-semibold text-tg-text"
        aria-label="Current month"
      >
        {currentMonthLabel()}
        <span className="text-tg-hint" aria-hidden>
          ▾
        </span>
      </button>

      <p className="text-[11px] font-medium uppercase tracking-wide text-tg-hint">
        Total spent this month
      </p>
      <p className={`mt-1 text-[28px] font-bold leading-tight tracking-tight ${loading ? 'text-tg-hint' : ''}`}>
        {loading ? '—' : formatMoney(view.monthTotal, view.currency)}
      </p>

      {/* Top category + budget */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-tg-secondary p-3.5">
          <p className="text-xs text-tg-hint">Top Category</p>
          <p className="mt-2 truncate text-[15px] font-semibold">
            {topCategory ? (
              <>
                <span className="mr-1">{topCategory.icon || CATEGORY_ICONS[topCategory.name] || '📦'}</span>
                {topCategory.name}
              </>
            ) : (
              <span className="text-tg-hint">—</span>
            )}
          </p>
          <p className="mt-1 text-sm font-bold">
            {topCategory
              ? `${formatAmountPlain(topCategory.amount)} ${view.currency}`
              : loading
                ? '…'
                : `0 ${view.currency}`}
          </p>
        </div>

        <button
          type="button"
          onClick={() => onBudgets?.()}
          className="rounded-2xl bg-tg-secondary p-3.5 text-left"
        >
          <p className="text-xs text-tg-hint">Budget Left</p>
          {view.budgetTotal != null ? (
            <>
              <p className="mt-2 text-[15px] font-bold">
                {formatAmountPlain(view.budgetLeft ?? 0)} {view.currency}
              </p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-tg-bg">
                <div
                  className="h-full rounded-full bg-tg-button"
                  style={{
                    width: `${Math.min(
                      100,
                      view.budgetTotal > 0
                        ? ((view.budgetTotal - (view.budgetLeft ?? 0)) / view.budgetTotal) * 100
                        : 0
                    )}%`,
                  }}
                />
              </div>
            </>
          ) : (
            <>
              <p className="mt-2 text-[15px] font-bold text-tg-hint">
                {loading ? '…' : 'Not set'}
              </p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-tg-bg">
                <div className="h-full w-0 rounded-full bg-tg-button" />
              </div>
            </>
          )}
        </button>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => onTransactions?.()}
          className="rounded-full bg-tg-secondary px-3 py-1.5 text-xs font-semibold"
        >
          Transactions
        </button>
        <button
          type="button"
          onClick={() => onBudgets?.()}
          className="rounded-full bg-tg-secondary px-3 py-1.5 text-xs font-semibold"
        >
          Budgets
        </button>
      </div>

      {/* Spending split */}
      <div className="mt-4 rounded-2xl bg-tg-secondary p-4">
        <h2 className="text-[15px] font-semibold">Spending Split</h2>
        <div className="mx-auto mt-3 max-w-[220px]">
          <Doughnut data={donutData} options={donutOptions} />
        </div>

        {view.byCategory.length === 0 ? (
          <p className="mt-3 text-center text-sm text-tg-hint">
            {loading ? 'Loading categories…' : 'No expenses this month yet.'}
          </p>
        ) : (
          <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5">
            {view.byCategory.map((c) => (
              <li key={c.name} className="flex min-w-0 items-center justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-1.5 truncate">
                  <span aria-hidden>{c.icon || CATEGORY_ICONS[c.name] || '📦'}</span>
                  <span className="truncate text-tg-text">{c.name}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">
                  {formatAmountPlain(c.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Last 7 days */}
      <div className="mt-4 rounded-2xl bg-tg-secondary p-4">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-semibold">Last 7 days</h2>
          <p className="text-xs text-tg-hint">
            Avg: {loading ? '…' : `${formatAmountPlain(Math.round(weekAvg))} ${view.currency}`}
          </p>
        </div>
        <div className="h-36">
          <Bar data={barData} options={barOptions} />
        </div>
      </div>

      {/* Recent */}
      <div className="mt-4">
        <div className="mb-2 flex items-baseline justify-between px-0.5">
          <h2 className="text-[15px] font-semibold">Recent</h2>
          <button
            type="button"
            onClick={() => onTransactions?.()}
            className="text-xs font-semibold text-tg-button"
          >
            {loading ? '…' : `${view.recentTransactions.length} items ›`}
          </button>
        </div>

        <div className="rounded-2xl bg-tg-secondary px-3 py-1">
          {loading ? (
            <p className="py-6 text-center text-sm text-tg-hint">Loading…</p>
          ) : view.recentTransactions.length === 0 ? (
            <p className="py-6 text-center text-sm text-tg-hint">Nothing logged yet.</p>
          ) : (
            <ul>
              {view.recentTransactions.map((tx, i) => {
                const icon = CATEGORY_ICONS[tx.category] ?? '❓';
                return (
                  <li
                    key={tx.id}
                    className={`flex items-center gap-3 py-3 ${
                      i < view.recentTransactions.length - 1 ? 'border-b border-tg-bg' : ''
                    }`}
                  >
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-tg-bg text-base"
                      aria-hidden
                    >
                      {icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{tx.note || 'Expense'}</p>
                      <p className="text-xs text-tg-hint">{relativeTime(tx.occurred_at)}</p>
                    </div>
                    <p className="shrink-0 text-sm font-bold tabular-nums">
                      {formatAmountPlain(tx.amount)}{' '}
                      <span className="font-semibold text-tg-hint">{view.currency}</span>
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

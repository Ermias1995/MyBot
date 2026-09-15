import { useEffect, useState } from 'react';
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
import { initTelegram, mainButton } from '../lib/telegram';

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const PALETTE = ['#f59e0b', '#3b82f6', '#22c55e', '#a855f7', '#ef4444', '#14b8a6', '#eab308', '#64748b'];

const CATEGORY_ICONS = {
  Food: '🍽️',
  Transport: '🚌',
  Rent: '🏠',
  Groceries: '🛒',
  Entertainment: '🎬',
  Health: '💊',
  Bills: '💡',
  Other: '📦',
};

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    initTelegram();
    const onAdd = () => alert('Add Expense screen coming in the next step.');
    mainButton.show('➕ Add Expense', onAdd);
    return () => mainButton.hide(onAdd);
  }, []);

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

  if (error) {
    const outsideTelegram = /Missing X-Telegram-Init-Data/.test(error.message);
    return (
      <div className="p-6 text-center">
        <p className="text-tg-text">Could not load the dashboard.</p>
        <p className="mt-2 text-sm text-tg-hint">{error.message}</p>
        {outsideTelegram && (
          <p className="mt-4 text-tg-hint">
            Tip: open this page inside Telegram — a plain browser has no initData.
          </p>
        )}
      </div>
    );
  }

  if (!data) {
    return <p className="p-6 text-center text-tg-hint">Loading…</p>;
  }

  const fmt = (value) =>
    new Intl.NumberFormat(undefined, { style: 'currency', currency: data.currency }).format(value);

  const topCategory = data.byCategory[0] ?? null;

  return (
    <div className="min-h-screen bg-tg-bg px-4 pb-6 pt-3 text-tg-text">
      <h1 className="mb-4 text-xl font-semibold">Dashboard</h1>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-tg-secondary p-4">
          <p className="text-xs text-tg-hint">This month</p>
          <p className="mt-1 text-lg font-bold">{fmt(data.monthTotal)}</p>
        </div>
        <div className="rounded-xl bg-tg-secondary p-4">
          <p className="text-xs text-tg-hint">Top category</p>
          <p className="mt-1 text-lg font-bold">
            {topCategory ? `${topCategory.icon} ${topCategory.name}` : '—'}
          </p>
        </div>
      </div>

      {data.byCategory.length === 0 ? (
        <p className="mb-4 rounded-xl bg-tg-secondary p-4 text-center text-tg-hint">
          No expenses this month yet.
        </p>
      ) : (
        <div className="mb-4 rounded-xl bg-tg-secondary p-4">
          <h2 className="mb-2 text-sm font-medium text-tg-hint">By category</h2>
          <Doughnut
            data={{
              labels: data.byCategory.map((c) => c.name),
              datasets: [
                {
                  data: data.byCategory.map((c) => c.amount),
                  backgroundColor: data.byCategory.map((c, i) => PALETTE[i % PALETTE.length]),
                  borderWidth: 0,
                },
              ],
            }}
            options={{
              cutout: '68%',
              plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 12 } } },
            }}
          />
        </div>
      )}

      <div className="mb-4 rounded-xl bg-tg-secondary p-4">
        <h2 className="mb-2 text-sm font-medium text-tg-hint">Last 7 days</h2>
        <Bar
          data={{
            labels: data.last7Days.map((d) => d.date.slice(5)),
            datasets: [
              {
                data: data.last7Days.map((d) => d.amount),
                backgroundColor: '#3b82f6',
                borderRadius: 4,
              },
            ],
          }}
          options={{
            plugins: { legend: { display: false } },
            scales: {
              x: { grid: { display: false } },
              y: { beginAtZero: true, ticks: { precision: 0 } },
            },
          }}
        />
      </div>

      <div className="rounded-xl bg-tg-secondary p-4">
        <h2 className="mb-3 text-sm font-medium text-tg-hint">Recent</h2>
        {data.recentTransactions.length === 0 ? (
          <p className="text-tg-hint">Nothing logged yet.</p>
        ) : (
          <ul className="space-y-3">
            {data.recentTransactions.map((tx) => (
              <li key={tx.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {CATEGORY_ICONS[tx.category] ?? '❓'} {tx.note || 'Expense'}
                  </p>
                  <p className="text-xs text-tg-hint">
                    {tx.category ?? 'Uncategorised'} ·{' '}
                    {new Date(tx.occurred_at).toLocaleDateString()}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold">{fmt(tx.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

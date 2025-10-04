import { formatCurrency, formatPercent } from "../utils/format.js";

function MetricsGrid({ cards }) {
  if (cards.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Metrics become available after you add holdings and refresh ROI data.
      </p>
    );
  }

  return (
    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {card.label}
          </dt>
          <dd className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
            {card.value}
          </dd>
          {card.detail && (
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{card.detail}</p>
          )}
        </div>
      ))}
    </dl>
  );
}

function AllocationList({ allocations }) {
  if (allocations.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Allocation insights appear once positions include market pricing.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {allocations.map((row) => (
        <li key={row.ticker} className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              {row.ticker}
            </p>
            <span className="text-sm font-medium text-indigo-600 dark:text-indigo-300">
              {formatPercent(row.weight * 100, 1)}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {formatCurrency(row.value)} current value
          </p>
          <div className="mt-3 h-2 rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-indigo-500 dark:bg-indigo-400"
              style={{ width: `${Math.min(row.weight * 100, 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function PerformanceHighlights({ performance }) {
  if (performance.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Add transactions to compute daily performance highlights.
      </p>
    );
  }

  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      {performance.map((item) => (
        <div
          key={item.label}
          className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
            {item.label}
          </dt>
          <dd className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
            {item.value}
          </dd>
          {item.description && (
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {item.description}
            </p>
          )}
        </div>
      ))}
    </dl>
  );
}

export default function MetricsTab({ metricCards, allocations, performance }) {
  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow dark:border-slate-800 dark:bg-slate-900">
        <header>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Key Ratios
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Compare portfolio returns against capital invested and realised gains.
          </p>
        </header>
        <div className="mt-4">
          <MetricsGrid cards={metricCards} />
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow dark:border-slate-800 dark:bg-slate-900">
        <header>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Allocation Concentration
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Understand where capital is concentrated to inform diversification efforts.
          </p>
        </header>
        <div className="mt-4">
          <AllocationList allocations={allocations} />
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow dark:border-slate-800 dark:bg-slate-900">
        <header>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Performance Highlights
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Daily ROI series is summarised into best, worst, and average sessions.
          </p>
        </header>
        <div className="mt-4">
          <PerformanceHighlights performance={performance} />
        </div>
      </section>
    </div>
  );
}

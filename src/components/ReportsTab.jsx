function SummaryCards({ cards }) {
  if (cards.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Summaries populate once transactions and holdings are available.
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

function ExportAction({ title, description, actionLabel, onAction, disabled }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{description}</p>
      <button
        type="button"
        onClick={onAction}
        disabled={disabled}
        className="mt-4 inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-400 disabled:text-slate-200 dark:disabled:bg-slate-700"
      >
        {actionLabel}
      </button>
    </div>
  );
}

export default function ReportsTab({ summaryCards, onExportTransactions, onExportHoldings, onExportPerformance }) {
  const disabled = summaryCards.length === 0;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow dark:border-slate-800 dark:bg-slate-900">
        <header>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Reporting Snapshot
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Generate CSV exports for bookkeeping and compliance workflows.
          </p>
        </header>
        <div className="mt-4">
          <SummaryCards cards={summaryCards} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <ExportAction
          title="Transactions Register"
          description="Download a transaction ledger including cash flow direction, share count, and execution price."
          actionLabel="Export Transactions CSV"
          onAction={onExportTransactions}
          disabled={disabled}
        />
        <ExportAction
          title="Holdings Snapshot"
          description="Capture the latest holdings with average cost, market value, and realised PnL totals."
          actionLabel="Export Holdings CSV"
          onAction={onExportHoldings}
          disabled={disabled}
        />
        <ExportAction
          title="Performance Series"
          description="Archive the daily ROI vs. SPY comparison for downstream analytics."
          actionLabel="Export Performance CSV"
          onAction={onExportPerformance}
          disabled={disabled}
        />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Tips</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-600 dark:text-slate-400">
          <li>Use exports to reconcile against brokerage statements or share with your accountant.</li>
          <li>Combine holdings and performance files to calculate exposure-adjusted returns in spreadsheets.</li>
          <li>Run exports after major allocation changes to maintain an audit-ready history.</li>
          <li>
            Need to ingest historical trades? The importer is still in development—follow the README
            instructions for posting normalised transactions to <code>/api/v1/portfolio/&lt;id&gt;</code>.
          </li>
        </ul>
      </section>
    </div>
  );
}

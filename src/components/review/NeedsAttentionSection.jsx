/**
 * src/components/review/NeedsAttentionSection.jsx
 * SR-022 — Shows high-priority inbox items requiring attention.
 */

import PropTypes from 'prop-types';

export default function NeedsAttentionSection({ items = [] }) {
  const sortedHighItems = [...items]
    .filter((item) => item.urgency === 'HIGH')
    .sort((a, b) => String(a.ticker).localeCompare(String(b.ticker)))
    .slice(0, 5);

  if (sortedHighItems.length === 0) {
    return (
      <section
        data-testid="needs-attention-section"
        className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
        aria-label="Needs attention"
      >
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Needs Attention
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No action needed — your portfolio is on track.
        </p>
      </section>
    );
  }

  return (
    <section
      data-testid="needs-attention-section"
      className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      aria-label="Needs attention"
    >
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Needs Attention ({sortedHighItems.length})
      </h2>
      <ul className="space-y-2">
        {sortedHighItems.map((item) => (
          <li
            key={item.eventKey}
            data-testid="needs-attention-item"
            className="flex items-start gap-3 rounded-md border border-slate-100 p-3 dark:border-slate-800"
          >
            <span
              className={
                item.urgency === 'HIGH'
                  ? 'mt-0.5 h-2 w-2 flex-shrink-0 rounded-full bg-rose-500'
                  : item.urgency === 'MEDIUM'
                    ? 'mt-0.5 h-2 w-2 flex-shrink-0 rounded-full bg-amber-400'
                    : 'mt-0.5 h-2 w-2 flex-shrink-0 rounded-full bg-sky-400'
              }
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                {item.ticker}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{item.description}</p>
              {item.rationale && (
                <p className="mt-1 text-xs italic text-slate-400 dark:text-slate-500">
                  {item.rationale}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

NeedsAttentionSection.propTypes = {
  items: PropTypes.arrayOf(
    PropTypes.shape({
      eventKey: PropTypes.string.isRequired,
      ticker: PropTypes.string.isRequired,
      urgency: PropTypes.oneOf(['HIGH', 'MEDIUM', 'LOW']).isRequired,
      description: PropTypes.string.isRequired,
      rationale: PropTypes.string,
    })
  ),
};

/**
 * src/components/review/DataBlockersSection.jsx
 * SR-024 — Shows holdings with stale/missing prices and degraded health reasons.
 */

import PropTypes from 'prop-types';

export default function DataBlockersSection({ degradedReasons = [], staleTickers = [] }) {
  const hasBlockers = degradedReasons.length > 0 || staleTickers.length > 0;

  return (
    <section
      data-testid="data-blockers-section"
      className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      aria-label="Data blockers"
    >
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Data Blockers
      </h2>
      {!hasBlockers ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">All data is current.</p>
      ) : (
        <div className="space-y-3">
          {degradedReasons.length > 0 && (
            <ul className="space-y-1">
              {degradedReasons.map((reason) => (
                <li key={reason} className="text-sm text-rose-600 dark:text-rose-400">
                  {reason}
                </li>
              ))}
            </ul>
          )}
          {staleTickers.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                Stale or missing prices:
              </p>
              <p className="text-sm text-amber-600 dark:text-amber-400">
                {staleTickers.join(', ')}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

DataBlockersSection.propTypes = {
  degradedReasons: PropTypes.arrayOf(PropTypes.string),
  staleTickers: PropTypes.arrayOf(PropTypes.string),
};

/**
 * src/components/review/RecentChangesSection.jsx
 * SR-023 — Shows meaningful NAV changes since last review.
 */

import PropTypes from 'prop-types';

export default function RecentChangesSection({ changes = [] }) {
  return (
    <section
      data-testid="recent-changes-section"
      className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      aria-label="Recent changes"
    >
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Recent Changes
      </h2>
      {changes.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No meaningful changes since your last review.
        </p>
      ) : (
        <ul className="space-y-2">
          {changes.map((change, i) => (
            <li key={change.key ?? i} className="text-sm text-slate-700 dark:text-slate-300">
              {change.label}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

RecentChangesSection.propTypes = {
  changes: PropTypes.arrayOf(
    PropTypes.shape({
      key: PropTypes.string,
      label: PropTypes.string.isRequired,
    })
  ),
};

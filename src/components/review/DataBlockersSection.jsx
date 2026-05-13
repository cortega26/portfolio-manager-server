/**
 * src/components/review/DataBlockersSection.jsx
 * SR-024 — Shows holdings with stale/missing prices and degraded health reasons.
 */

import PropTypes from 'prop-types';
import { useI18n } from '../../i18n/I18nProvider.jsx';

export default function DataBlockersSection({ degradedReasons = [], staleTickers = [] }) {
  const { t } = useI18n();
  const hasBlockers = degradedReasons.length > 0 || staleTickers.length > 0;

  return (
    <section
      data-testid="data-blockers-section"
      className="card-base p-5"
      aria-label="Data blockers"
    >
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-surface-500 dark:text-surface-400">
        {t('review.dataBlockers')}
      </h2>
      {!hasBlockers ? (
        <p className="text-sm text-surface-500 dark:text-surface-400">
          {t('review.dataBlockers.empty')}
        </p>
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
              <p className="mb-1 text-xs font-medium text-surface-500 dark:text-surface-400">
                {t('review.dataBlockers.staleLabel')}
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

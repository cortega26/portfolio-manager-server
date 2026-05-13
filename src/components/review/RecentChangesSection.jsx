/**
 * src/components/review/RecentChangesSection.jsx
 * SR-023 — Shows meaningful NAV changes since last review.
 */

import { useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import Decimal from 'decimal.js';
import { useI18n } from '../../i18n/I18nProvider.jsx';

const STORAGE_PREFIX = 'portfolio-manager-recent-nav-snapshot';
const MIN_NAV_DELTA = new Decimal('0.01');

function getStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function getStorageKey(portfolioId) {
  return `${STORAGE_PREFIX}:${portfolioId || 'default'}`;
}

function parseStoredSnapshot(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.date !== 'string') return null;
    if (parsed.portfolio_nav == null) return null;
    const nav = new Decimal(parsed.portfolio_nav);
    if (!nav.isFinite()) return null;
    return { date: parsed.date, portfolio_nav: nav.toString() };
  } catch {
    return null;
  }
}

function resolveLatestNavSnapshot(navDaily) {
  if (!Array.isArray(navDaily) || navDaily.length === 0) return null;
  for (let index = navDaily.length - 1; index >= 0; index -= 1) {
    const row = navDaily[index];
    if (!row || typeof row.date !== 'string' || row.portfolio_nav == null) continue;
    try {
      const nav = new Decimal(row.portfolio_nav);
      if (!nav.isFinite()) continue;
      return { date: row.date, portfolio_nav: nav.toString() };
    } catch {
      continue;
    }
  }
  return null;
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value.toNumber());
}

function buildNavChange(previousSnapshot, latestSnapshot) {
  if (!previousSnapshot || !latestSnapshot) return null;
  const previousNav = new Decimal(previousSnapshot.portfolio_nav);
  const latestNav = new Decimal(latestSnapshot.portfolio_nav);
  const delta = latestNav.minus(previousNav);
  if (delta.abs().lessThan(MIN_NAV_DELTA)) return null;

  const sign = delta.greaterThanOrEqualTo(0) ? '+' : '';
  const label = `NAV ${sign}${formatCurrency(delta)} since ${previousSnapshot.date}`;
  return {
    key: `nav-${latestSnapshot.date}`,
    label,
  };
}

export default function RecentChangesSection({
  changes = [],
  navDaily = [],
  portfolioId = 'default',
}) {
  const { t } = useI18n();
  const latestSnapshot = useMemo(() => resolveLatestNavSnapshot(navDaily), [navDaily]);
  const storedSnapshot = useMemo(() => {
    const storage = getStorage();
    if (!storage) return null;
    return parseStoredSnapshot(storage.getItem(getStorageKey(portfolioId)));
  }, [portfolioId]);
  const derivedChanges = useMemo(() => {
    const navChange = buildNavChange(storedSnapshot, latestSnapshot);
    return navChange ? [navChange] : [];
  }, [latestSnapshot, storedSnapshot]);
  const visibleChanges = changes.length > 0 ? changes : derivedChanges;

  useEffect(() => {
    if (!latestSnapshot) return;
    const storage = getStorage();
    if (!storage) return;
    storage.setItem(getStorageKey(portfolioId), JSON.stringify(latestSnapshot));
  }, [latestSnapshot, portfolioId]);

  return (
    <section
      data-testid="recent-changes-section"
      className="card-base p-5"
      aria-label="Recent changes"
    >
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-surface-500 dark:text-surface-400">
        {t('review.recentChanges')}
      </h2>
      {visibleChanges.length === 0 ? (
        <p className="text-sm text-surface-500 dark:text-surface-400">
          {t('review.recentChanges.empty')}
        </p>
      ) : (
        <ul className="space-y-2">
          {visibleChanges.map((change, i) => (
            <li key={change.key ?? i} className="text-sm text-surface-700 dark:text-surface-300">
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
  navDaily: PropTypes.arrayOf(
    PropTypes.shape({
      date: PropTypes.string,
      portfolio_nav: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    })
  ),
  portfolioId: PropTypes.string,
};

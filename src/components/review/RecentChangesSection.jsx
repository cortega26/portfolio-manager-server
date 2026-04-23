/**
 * src/components/review/RecentChangesSection.jsx
 * SR-023 — Shows meaningful NAV changes since last review.
 */

import { useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import Decimal from 'decimal.js';

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
      className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      aria-label="Recent changes"
    >
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Recent Changes
      </h2>
      {visibleChanges.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No meaningful changes since your last review.
        </p>
      ) : (
        <ul className="space-y-2">
          {visibleChanges.map((change, i) => (
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
  navDaily: PropTypes.arrayOf(
    PropTypes.shape({
      date: PropTypes.string,
      portfolio_nav: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    })
  ),
  portfolioId: PropTypes.string,
};

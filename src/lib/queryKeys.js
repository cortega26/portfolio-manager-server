/**
 * Query-key factory for TanStack Query.
 *
 * Stable, hierarchical keys so invalidating a parent key cascades to all
 * related queries (e.g. invalidating ['performance', portfolioId] also
 * invalidates benchmark-summary and nav-daily sub-keys).
 *
 * Extra arguments on `performance()` (first-date, tx-count) are used as
 * cheap change-detection signals so the query refetches when transactions
 * change, matching the pre-TanStack useEffect dependency behaviour.
 */
export const queryKeys = {
  portfolios: ['portfolios'],

  /** Extra args are used for cache-busting, not for the invalidation prefix. */
  performance: (portfolioId, ...extra) =>
    extra.length > 0 ? ['performance', portfolioId, ...extra] : ['performance', portfolioId],

  benchmarkSummary: (portfolioId, from, to) => [
    'performance',
    portfolioId,
    'benchmark-summary',
    from,
    to,
  ],

  navDaily: (portfolioId, from, to) => ['performance', portfolioId, 'nav-daily', from, to],

  /** Invalidate all performance data for a given portfolio. */
  portfolio: (portfolioId) => ['performance', portfolioId],
};

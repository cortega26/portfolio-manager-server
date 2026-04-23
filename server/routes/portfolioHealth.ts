/**
 * server/routes/portfolioHealth.ts
 *
 * SR-002 — GET /api/portfolio/:id/health
 *
 * Returns a lightweight health summary for a portfolio:
 * - Overall freshness state
 * - Confidence level
 * - Degraded reasons
 * - Number of actionable items (inbox count)
 * - as_of timestamp
 */

import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { FastifyPluginOptions } from 'fastify';

import { portfolioIdSchema } from './_schemas.js';
import { readPortfolioState } from '../data/portfolioState.js';
import { buildFreshPriceSnapshot } from './_helpers.js';
import type { StorageAdapter } from './portfolio.js';
import type { HistoricalPriceLoader } from './prices.js';
import { buildTrustFromPriceStatus, buildUnknownTrust } from '../../shared/trustUtils.js';
import type { TrustMetadata } from '../../shared/trust.js';
import { isOpenSignalHolding } from '../../shared/signals.js';
import { sortTransactions, projectStateUntil } from '../finance/portfolio.js';
import { computeInbox } from '../finance/inboxComputer.js';

// ── Plugin options ───────────────────────────────────────────────────────────

export interface PortfolioHealthRouteContext extends FastifyPluginOptions {
  getStorage: () => Promise<StorageAdapter>;
  config: {
    freshness?: { maxStaleTradingDays: number };
  };
  historicalPriceLoader?: HistoricalPriceLoader;
}

// ── Response schema ──────────────────────────────────────────────────────────

const PortfolioHealthResponseSchema = z.object({
  portfolio_id: z.string(),
  freshness_state: z.enum(['fresh', 'stale', 'unknown']),
  confidence_state: z.enum(['high', 'medium', 'low', 'degraded', 'unknown']),
  degraded_reasons: z.array(z.string()),
  unresolved_exception_count: z.number().int().nonnegative(),
  action_count: z.number().int().nonnegative(),
  as_of: z.string(),
});

// ── Helper: derive freshness from price snapshots ────────────────────────────

type PriceSnapshot = { price: number | null; asOf: string | null };

/**
 * Derives a trust metadata object from a map of price snapshots.
 *
 * If there are no holdings, returns 'unknown' freshness trust.
 * Otherwise, uses the worst snapshot among all holdings.
 */
function deriveTrust(snapshots: Map<string, PriceSnapshot>): TrustMetadata {
  if (snapshots.size === 0) {
    return buildUnknownTrust();
  }

  const entries = Array.from(snapshots.values());
  const allNull = entries.every((s) => s.price === null);
  if (allNull) {
    return buildTrustFromPriceStatus('unavailable', undefined);
  }

  const hasNull = entries.some((s) => s.price === null);
  if (hasNull) {
    const trust = buildTrustFromPriceStatus('degraded', undefined);
    trust.degraded_reason = 'partial_portfolio';
    return trust;
  }

  const asOfs = entries
    .map((s) => s.asOf)
    .filter((d): d is string => typeof d === 'string');

  if (asOfs.length === 0) {
    return buildTrustFromPriceStatus('cache_fresh', undefined);
  }

  const oldestAsOf = [...asOfs].sort()[0];
  return buildTrustFromPriceStatus('cache_fresh', oldestAsOf);
}

// ── Route plugin ─────────────────────────────────────────────────────────────

const portfolioHealthRoutes: FastifyPluginAsyncZod<PortfolioHealthRouteContext> = async (app, opts) => {
  const { getStorage } = opts;

  app.get(
    '/portfolio/:id/health',
    {
      preHandler: app.requireAuth,
      schema: {
        params: z.object({ id: portfolioIdSchema }),
        response: {
          200: PortfolioHealthResponseSchema,
          404: z.object({ error: z.string(), message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const storage = await getStorage();
      const portfolio = await readPortfolioState(storage, id);

      if (!portfolio) {
        return reply.code(404).send({ error: 'NOT_FOUND', message: 'Portfolio not found.' });
      }

      const transactions = (portfolio.transactions ?? []) as Record<string, unknown>[];

      // Derive open tickers from portfolio state.
      const sorted = sortTransactions(transactions as never[]) as unknown as Record<string, unknown>[];
      const lastDate = sorted.length > 0 ? String(sorted[sorted.length - 1]?.['date'] ?? '') : '';
      const projected = lastDate
        ? projectStateUntil(sorted as never[], lastDate)
        : { holdings: new Map<string, number>() };
      const openTickers = Array.from((projected.holdings as Map<string, number>).entries())
        .filter(([, qty]) => isOpenSignalHolding(qty))
        .map(([ticker]) => ticker);

      // Fetch latest prices.
      const priceSnapshots = new Map<string, PriceSnapshot>();
      if (opts.historicalPriceLoader && openTickers.length > 0) {
        const maxStaleDays = opts.config.freshness?.maxStaleTradingDays ?? 30;
        await Promise.all(openTickers.map(async (symbol) => {
          try {
            const result = await opts.historicalPriceLoader!.fetchSeries(symbol, { range: '1y', latestOnly: true });
            const latest = Array.isArray(result.prices) ? result.prices[result.prices.length - 1] : null;
            priceSnapshots.set(symbol, buildFreshPriceSnapshot(latest, maxStaleDays));
          } catch {
            priceSnapshots.set(symbol, { price: null, asOf: null });
          }
        }));
      }

      const trust = deriveTrust(priceSnapshots);

      // Count actionable inbox items (non-fatal — failure returns 0).
      let actionCount = 0;
      try {
        const signals = (portfolio.signals ?? {}) as Record<string, unknown>;
        const allReviews = await storage.readTable('inbox_reviews');
        const dismissHistory = allReviews.filter(
          (r) => r['portfolio_id'] === id,
        );
        const items = computeInbox({
          transactions: transactions as never[],
          signals,
          priceSnapshots,
          dismissHistory: dismissHistory as never[],
        });
        actionCount = Array.isArray(items) ? items.length : 0;
      } catch {
        actionCount = 0;
      }

      return reply.code(200).send({
        portfolio_id: id,
        freshness_state: trust.freshness_state,
        confidence_state: trust.confidence_state,
        degraded_reasons: trust.degraded_reason ? [trust.degraded_reason] : [],
        unresolved_exception_count: 0,
        action_count: actionCount,
        as_of: new Date().toISOString(),
      });
    },
  );
};

export default portfolioHealthRoutes;

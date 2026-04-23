// server/routes/portfolio.ts
// Routes: GET/POST /portfolio/:id and sub-routes for transactions, performance, holdings, cashRates
// DB Write policy: all multi-write handlers use withLock() for serialization.
import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { FastifyPluginOptions } from 'fastify';
import { portfolioIdSchema, paginationSchema, isoDateSchema, transactionTypeSchema, cashRateSchema, portfolioBodySchema } from './_schemas.js';
import { withLock } from '../utils/locks.js';
import { readPortfolioState, writePortfolioState } from '../data/portfolioState.js';
import { ensureTransactionUids, enforceNonNegativeCash, enforceOversellPolicy } from '../services/portfolioTransactions.js';
import { listPortfolioSignalNotifications } from '../services/signalNotifications.js';
import { requeueSignalNotificationEmailDelivery } from '../services/signalNotificationEmail.js';
import { matchLots } from '../finance/lotMatcher.js';
import type { LotTransaction, ClosedLot } from '../finance/lotMatcher.js';
import { d } from '../finance/decimal.js';
import { computeInbox } from '../finance/inboxComputer.js';
import type { InboxReviewRecord } from '../types/inbox.js';
import type { HistoricalPriceLoader } from './prices.js';
import { buildFreshPriceSnapshot, paginateRows } from './_helpers.js';

// Minimal storage interface used by this route
export interface StorageAdapter {
  readTable(name: string): Promise<Record<string, unknown>[]>;
  writeTable(name: string, rows: Record<string, unknown>[]): Promise<void>;
  upsertRow(name: string, row: Record<string, unknown>, keyFields: string[]): Promise<void>;
  ensureTable(name: string, rows: Record<string, unknown>[]): Promise<void>;
}

export interface PortfolioRouteContext extends FastifyPluginOptions {
  getStorage: () => Promise<StorageAdapter>;
  config: {
    featureFlags: { cashBenchmarks: boolean };
    cache: { ttlSeconds: number };
    freshness?: { maxStaleTradingDays: number };
  };
  analyticsCache?: { flush(): void };
  historicalPriceLoader?: HistoricalPriceLoader;
}

// ── Response schemas ─────────────────────────────────────────────────────────

const TransactionRowSchema = z.record(z.string(), z.unknown());

const TransactionListResponseSchema = z.object({
  items: z.array(TransactionRowSchema),
  meta: z.object({
    page: z.number(),
    per_page: z.number(),
    total: z.number(),
    total_pages: z.number(),
  }),
});

const HoldingSchema = z.object({
  ticker: z.string(),
  shares: z.number(),
});

const HoldingsResponseSchema = z.object({
  holdings: z.array(HoldingSchema),
  asOf: z.string().nullable(),
});

const PortfolioStateResponseSchema = z.record(z.string(), z.unknown());

const SaveResponseSchema = z.object({ status: z.string() });

const CashRatesResponseSchema = z.object({
  currency: z.string(),
  apyTimeline: z.array(cashRateSchema),
});

// ── Route plugin ─────────────────────────────────────────────────────────────

const portfolioRoutes: FastifyPluginAsyncZod<PortfolioRouteContext> = async (app, opts) => {
  const { getStorage, analyticsCache } = opts;

  // ── GET /portfolio/:id ───────────────────────────────────────────────────
  app.get(
    '/portfolio/:id',
    {
      preHandler: app.requireAuth,
      schema: {
        params: z.object({ id: portfolioIdSchema }),
        response: {
          200: PortfolioStateResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const storage = await getStorage();
      const portfolio = await readPortfolioState(storage, id);
      if (!portfolio) {
        return reply.code(200).send({});
      }
      return app.sendWithEtag(request, reply, portfolio);
    },
  );

  // ── POST /portfolio/:id ──────────────────────────────────────────────────
  // DB Write policy: uses withLock() to serialize concurrent writes — satisfies 2.31b.
  app.post(
    '/portfolio/:id',
    {
      preHandler: app.requireAuth,
      schema: {
        params: z.object({ id: portfolioIdSchema }),
        body: portfolioBodySchema,
        response: {
          200: SaveResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const payload = request.body;
      const autoClip = Boolean((payload.settings as Record<string, unknown> | undefined)?.['autoClip']);
      const logger = {
        info: (msg: string, meta?: object) => app.log.info({ ...(meta as Record<string, unknown>) }, msg),
        warn: (msg: string, meta?: object) => app.log.warn({ ...(meta as Record<string, unknown>) }, msg),
      };

      let normalizedTransactions: object[];
      try {
        normalizedTransactions = ensureTransactionUids(payload.transactions ?? [], id, logger);
      } catch (error) {
        const err = error as { statusCode?: number; code?: string; message?: string; details?: unknown };
        (reply as unknown as { code(n: number): { send(v: unknown): void } }).code(err.statusCode ?? 400).send({
          error: err.code ?? 'VALIDATION_ERROR',
          message: err.message ?? 'Validation failed',
          ...(err.details !== undefined ? { details: err.details } : {}),
        });
        return reply;
      }

      try {
        enforceOversellPolicy(normalizedTransactions, { portfolioId: id, autoClip, logger });
        enforceNonNegativeCash(normalizedTransactions, { portfolioId: id, logger });
      } catch (error) {
        const err = error as { statusCode?: number; code?: string; message?: string; details?: unknown };
        (reply as unknown as { code(n: number): { send(v: unknown): void } }).code(err.statusCode ?? 400).send({
          error: err.code ?? 'VALIDATION_ERROR',
          message: err.message ?? 'Validation failed',
          ...(err.details !== undefined ? { details: err.details } : {}),
        });
        return reply;
      }

      const cashCurrency =
        typeof (payload.cash as Record<string, unknown> | undefined)?.['currency'] === 'string'
          ? (payload.cash as Record<string, unknown>)['currency'] as string
          : 'USD';
      const cashTimeline = Array.isArray((payload.cash as Record<string, unknown> | undefined)?.['apyTimeline'])
        ? ((payload.cash as Record<string, unknown>)['apyTimeline'] as Record<string, unknown>[]).map((entry) => ({
            from: entry['from'],
            to: entry['to'] ?? null,
            apy: Number(entry['apy']),
          }))
        : [];

      await withLock(`portfolio:${id}`, async () => {
        const storage = await getStorage();
        await writePortfolioState(storage, id, {
          transactions: normalizedTransactions,
          signals: (payload.signals as Record<string, unknown>) ?? {},
          settings: payload.settings as Record<string, unknown> | undefined,
          cash: { currency: cashCurrency, apyTimeline: cashTimeline },
        });
      });

      analyticsCache?.flush();
      return reply.code(200).send({ status: 'ok' });
    },
  );

  // ── GET /portfolio/:id/transactions ──────────────────────────────────────
  app.get(
    '/portfolio/:id/transactions',
    {
      preHandler: app.requireAuth,
      schema: {
        params: z.object({ id: portfolioIdSchema }),
        querystring: paginationSchema.extend({
          type: transactionTypeSchema.optional(),
          from: isoDateSchema.optional(),
          to: isoDateSchema.optional(),
        }),
        response: {
          200: TransactionListResponseSchema,
        },
      },
    },
    async (request) => {
      const { id } = request.params;
      const { page, per_page, type, from, to } = request.query;

      const storage = await getStorage();
      const portfolio = (await readPortfolioState(storage, id)) as {
        transactions?: Record<string, unknown>[];
      } | null;

      let rows: Record<string, unknown>[] = Array.isArray(portfolio?.transactions)
        ? (portfolio.transactions as Record<string, unknown>[])
        : [];

      if (type) rows = rows.filter((r) => r['type'] === type);
      if (from) rows = rows.filter((r) => typeof r['date'] === 'string' && (r['date'] as string) >= from);
      if (to) rows = rows.filter((r) => typeof r['date'] === 'string' && (r['date'] as string) <= to);

      return paginateRows(rows, { page, perPage: per_page });
    },
  );

  // ── POST /portfolio/:id/transactions ─────────────────────────────────────
  // DB Write policy: uses withLock() to serialize concurrent writes — satisfies 2.31b.
  app.post(
    '/portfolio/:id/transactions',
    {
      preHandler: app.requireAuth,
      schema: {
        params: z.object({ id: portfolioIdSchema }),
        body: z.object({
          transactions: z.array(z.record(z.string(), z.unknown())),
        }),
        response: {
          200: SaveResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { transactions: newTransactions } = request.body;

      await withLock(`portfolio:${id}`, async () => {
        const storage = await getStorage();
        const existing = (await readPortfolioState(storage, id)) as {
          transactions?: unknown[];
          signals?: unknown;
          settings?: unknown;
          cash?: unknown;
        } | null;

        const merged = [
          ...((existing?.transactions ?? []) as unknown[]),
          ...newTransactions,
        ];

        await writePortfolioState(storage, id, {
          transactions: merged,
          signals: existing?.signals ?? {},
          settings: existing?.settings,
          cash: existing?.cash ?? { currency: 'USD', apyTimeline: [] },
        });
      });

      return reply.code(200).send({ status: 'ok' });
    },
  );

  // ── GET /portfolio/:id/performance ────────────────────────────────────────
  app.get(
    '/portfolio/:id/performance',
    {
      preHandler: app.requireAuth,
      schema: {
        params: z.object({ id: portfolioIdSchema }),
        querystring: z.object({
          from: isoDateSchema.optional(),
          to: isoDateSchema.optional(),
          benchmark: z.string().optional(),
        }),
        response: {
          200: z.record(z.string(), z.unknown()),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { from, to, benchmark } = request.query;

      const storage = await getStorage();
      const portfolio = (await readPortfolioState(storage, id)) as Record<string, unknown> | null;

      if (!portfolio) {
        throw Object.assign(new Error('Portfolio not found.'), { statusCode: 404, code: 'NOT_FOUND' });
      }

      // Return a placeholder until full performance computation is wired in Phase 3
      const performancePayload: Record<string, unknown> = {
        portfolioId: id,
        from: from ?? null,
        to: to ?? null,
        benchmark: benchmark ?? null,
      };

      return app.sendWithEtag(request, reply, performancePayload);
    },
  );

  // ── GET /portfolio/:id/holdings ───────────────────────────────────────────
  app.get(
    '/portfolio/:id/holdings',
    {
      preHandler: app.requireAuth,
      schema: {
        params: z.object({ id: portfolioIdSchema }),
        response: {
          200: HoldingsResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const storage = await getStorage();
      const portfolio = (await readPortfolioState(storage, id)) as {
        transactions?: Array<{ type: string; ticker?: string; shares?: number; date: string }>;
      } | null;

      if (!portfolio) {
        throw Object.assign(new Error('Portfolio not found.'), { statusCode: 404, code: 'NOT_FOUND' });
      }

      // Derive holdings by summing BUY/SELL transactions
      const holdingsMap = new Map<string, number>();
      const transactions = portfolio.transactions ?? [];
      let lastDate: string | null = null;

      for (const tx of transactions) {
        if (!tx.ticker || tx.ticker === 'CASH') continue;
        const current = holdingsMap.get(tx.ticker) ?? 0;
        const shares = Math.abs(tx.shares ?? 0);
        if (tx.type === 'BUY') {
          holdingsMap.set(tx.ticker, current + shares);
        } else if (tx.type === 'SELL') {
          holdingsMap.set(tx.ticker, Math.max(0, current - shares));
        }
        if (!lastDate || tx.date > lastDate) lastDate = tx.date;
      }

      const holdings = Array.from(holdingsMap.entries())
        .filter(([, shares]) => shares > 0)
        .map(([ticker, shares]) => ({ ticker, shares }));

      return app.sendWithEtag(request, reply, { holdings, asOf: lastDate });
    },
  );

  // ── GET /portfolio/:id/cashRates ──────────────────────────────────────────
  app.get(
    '/portfolio/:id/cashRates',
    {
      preHandler: app.requireAuth,
      schema: {
        params: z.object({ id: portfolioIdSchema }),
        response: {
          200: CashRatesResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const storage = await getStorage();
      const portfolio = (await readPortfolioState(storage, id)) as {
        cash?: { currency?: string; apyTimeline?: unknown[] };
      } | null;

      if (!portfolio) {
        throw Object.assign(new Error('Portfolio not found.'), { statusCode: 404, code: 'NOT_FOUND' });
      }

      return reply.code(200).send({
        currency: portfolio.cash?.currency ?? 'USD',
        apyTimeline: (portfolio.cash?.apyTimeline ?? []) as z.infer<typeof cashRateSchema>[],
      });
    },
  );

  // ── POST /portfolio/:id/cashRates ─────────────────────────────────────────
  // DB Write policy: uses withLock() to serialize concurrent writes — satisfies 2.31b.
  app.post(
    '/portfolio/:id/cashRates',
    {
      preHandler: app.requireAuth,
      schema: {
        params: z.object({ id: portfolioIdSchema }),
        body: z.object({
          cashRates: z.array(cashRateSchema),
        }),
        response: {
          200: SaveResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { cashRates } = request.body;

      await withLock(`portfolio:${id}`, async () => {
        const storage = await getStorage();
        const existing = (await readPortfolioState(storage, id)) as {
          transactions?: unknown[];
          signals?: unknown;
          settings?: unknown;
          cash?: { currency?: string; apyTimeline?: unknown[] };
        } | null;

        await writePortfolioState(storage, id, {
          transactions: existing?.transactions ?? [],
          signals: existing?.signals ?? {},
          settings: existing?.settings,
          cash: {
            currency: existing?.cash?.currency ?? 'USD',
            apyTimeline: cashRates,
          },
        });
      });

      return reply.code(200).send({ status: 'ok' });
    },
  );

  // ── GET /portfolio/:id/signal-notifications ───────────────────────────────
  app.get(
    '/portfolio/:id/signal-notifications',
    {
      preHandler: app.requireAuth,
      schema: {
        params: z.object({ id: portfolioIdSchema }),
        querystring: z.object({ limit: z.coerce.number().int().positive().optional() }),
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { limit } = request.query;
      const storage = await getStorage();
      const data = await listPortfolioSignalNotifications(storage, id, { limit });
      return reply.code(200).send({ data });
    },
  );

  // ── POST /portfolio/:id/signal-notifications/:notificationId/requeue-email ─
  app.post(
    '/portfolio/:id/signal-notifications/:notificationId/requeue-email',
    {
      preHandler: app.requireAuth,
      schema: {
        params: z.object({ id: portfolioIdSchema, notificationId: z.string().min(1) }),
      },
    },
    async (request, reply) => {
      const { id, notificationId } = request.params;
      const storage = await getStorage();
      const result = await (requeueSignalNotificationEmailDelivery as (opts: {
        storage: unknown; portfolioId: string; notificationId: string;
      }) => Promise<{ changed: boolean; reason: string; notification: unknown } | null>)({
        storage,
        portfolioId: id,
        notificationId,
      });
      if (!result) {
        return reply.code(404).send({ error: 'SIGNAL_NOTIFICATION_NOT_FOUND', message: 'Signal notification not found.' });
      }
      return reply.code(200).send({ status: 'ok', changed: result.changed, reason: result.reason, data: result.notification });
    },
  );

  // ── GET /portfolio/:id/realized-gains ─────────────────────────────────────
  app.get(
    '/portfolio/:id/realized-gains',
    {
      preHandler: app.requireAuth,
      schema: {
        params: z.object({ id: portfolioIdSchema }),
        response: {
          200: z.record(z.string(), z.unknown()),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const storage = await getStorage();
      const portfolio = (await readPortfolioState(storage, id)) as {
        transactions?: Array<Record<string, unknown>>;
      } | null;

      if (!portfolio) {
        throw Object.assign(new Error('Portfolio not found.'), { statusCode: 404, code: 'NOT_FOUND' });
      }

      // Map stored transactions to the minimal shape expected by the lot matcher.
      const txs: LotTransaction[] = (portfolio.transactions ?? []).map((tx) => ({
        date: String(tx['date'] ?? ''),
        type: String(tx['type'] ?? ''),
        ticker: typeof tx['ticker'] === 'string' ? tx['ticker'] : undefined,
        shares: tx['shares'] != null ? String(tx['shares']) : undefined,
        price: tx['price'] != null ? String(tx['price']) : undefined,
        uid: typeof tx['uid'] === 'string' ? tx['uid'] : undefined,
      }));

      // Sort ascending by date (lot matcher requires chronological order).
      txs.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

      const { closedLots, openLots } = matchLots(txs);

      // ── Group closed lots by calendar year ──────────────────────────────
      const byYear = new Map<number, ClosedLot[]>();
      for (const lot of closedLots) {
        const year = Number(lot.sellDate.slice(0, 4));
        if (!byYear.has(year)) byYear.set(year, []);
        byYear.get(year)!.push(lot);
      }

      const years = Array.from(byYear.entries())
        .sort(([a], [b]) => a - b)
        .map(([year, lots]) => {
          let totalGain = d(0);
          let totalLoss = d(0);
          for (const lot of lots) {
            const gl = d(lot.gainLoss);
            if (gl.gte(0)) {
              totalGain = totalGain.plus(gl);
            } else {
              totalLoss = totalLoss.plus(gl);
            }
          }
          const netRealized = totalGain.plus(totalLoss);
          return {
            year,
            closedLots: lots,
            totalGain: totalGain.toFixed(2),
            totalLoss: totalLoss.toFixed(2),
            netRealized: netRealized.toFixed(2),
            lotCount: lots.length,
          };
        });

      // ── Unrealized today (open lots) ─────────────────────────────────────
      const unrealizedToday = {
        holdings: openLots,
        totalUnrealized: null, // pricing not available in this endpoint
      };

      return app.sendWithEtag(request, reply, {
        method: 'FIFO',
        years,
        unrealizedToday,
      });
    },
  );

  // ── GET /portfolio/:id/inbox ──────────────────────────────────────────────
  // Returns computed Action Inbox feed items for the portfolio.
  const InboxItemSchema = z.object({
    ticker: z.string(),
    eventType: z.string(),
    eventKey: z.string(),
    urgency: z.enum(['HIGH', 'MEDIUM', 'LOW']),
    description: z.string(),
    shares: z.string(),
    currentValue: z.string().nullable(),
    currentPrice: z.string().nullable(),
    currentPriceAsOf: z.string().nullable(),
    thresholdPct: z.number().optional(),
    signalStatus: z.string().optional(),
    movePct: z.number().optional(),
    tradingDaysUnreviewed: z.number().optional(),
    rationale: z.string().optional(),
    source: z.enum(['threshold', 'policy']).optional(),
  });

  const InboxResponseSchema = z.object({
    items: z.array(InboxItemSchema),
    computedAt: z.string(),
  });

  app.get(
    '/portfolio/:id/inbox',
    {
      preHandler: app.requireAuth,
      schema: {
        params: z.object({ id: portfolioIdSchema }),
        response: { 200: InboxResponseSchema },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const storage = await getStorage();
      const portfolio = (await readPortfolioState(storage, id)) as {
        transactions?: Record<string, unknown>[];
        signals?: Record<string, unknown>;
      } | null;

      if (!portfolio) {
        throw Object.assign(new Error('Portfolio not found.'), { statusCode: 404, code: 'NOT_FOUND' });
      }

      const transactions = (portfolio.transactions ?? []) as Record<string, unknown>[];
      const signals = (portfolio.signals ?? {}) as Record<string, unknown>;

      // Derive open tickers from portfolio state.
      const { isOpenSignalHolding } = await import('../../shared/signals.js');
      const { sortTransactions: sortTxs, projectStateUntil: project } = await import('../finance/portfolio.js');
      const sorted = sortTxs(transactions as never[]) as unknown as Record<string, unknown>[];
      const lastDate = sorted.length > 0 ? String(sorted[sorted.length - 1]?.['date'] ?? '') : '';
      const projected = lastDate ? project(sorted as never[], lastDate) : { holdings: new Map() };
      const openTickers = Array.from((projected.holdings as Map<string, number>).entries())
        .filter(([, qty]) => isOpenSignalHolding(qty))
        .map(([ticker]) => ticker as string);

      // Fetch latest prices for open tickers.
      const priceSnapshots = new Map<string, { price: number | null; asOf: string | null }>();
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
      } else {
        for (const t of openTickers) {
          priceSnapshots.set(t, { price: null, asOf: null });
        }
      }

      // Load dismiss history for this portfolio.
      const allReviews = await storage.readTable('inbox_reviews');
      const dismissHistory = allReviews.filter(
        (r) => r['portfolio_id'] === id,
      ) as unknown as InboxReviewRecord[];

      const items = computeInbox({
        transactions: transactions as never[],
        signals,
        priceSnapshots,
        dismissHistory,
      });

      return reply.code(200).send({ items, computedAt: new Date().toISOString() });
    },
  );

  // ── POST /portfolio/:id/inbox/dismiss ─────────────────────────────────────
  // Zod schema for the dismiss body.
  const DismissBodySchema = z.object({
    ticker: z.string().min(1).max(32).transform((v) => v.trim().toUpperCase()),
    eventType: z.enum(['THRESHOLD_TRIGGERED', 'LARGE_MOVE_UNREVIEWED', 'LONG_UNREVIEWED', 'NO_THRESHOLD_CONFIGURED']),
    eventKey: z.string().min(1).max(256),
  });

  app.post(
    '/portfolio/:id/inbox/dismiss',
    {
      preHandler: app.requireAuth,
      schema: {
        params: z.object({ id: portfolioIdSchema }),
        body: DismissBodySchema,
        response: { 200: z.object({ ok: z.literal(true) }) },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { ticker, eventType, eventKey } = request.body;

      await withLock(`inbox-reviews:${id}`, async () => {
        const storage = await getStorage();
        await storage.ensureTable('inbox_reviews', []);
        const record: InboxReviewRecord = {
          portfolio_id: id,
          ticker,
          event_type: eventType,
          event_key: eventKey,
          dismissed_at: new Date().toISOString(),
        };
        const existing = await storage.readTable('inbox_reviews');
        await storage.writeTable('inbox_reviews', [...existing, record as unknown as Record<string, unknown>]);
      });

      return reply.code(200).send({ ok: true });
    },
  );
};

export default portfolioRoutes;

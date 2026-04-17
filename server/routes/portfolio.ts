// server/routes/portfolio.ts
// Routes: GET/POST /portfolio/:id and sub-routes for transactions, performance, holdings, cashRates
// DB Write policy: all multi-write handlers use withLock() for serialization.
import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { FastifyPluginOptions } from 'fastify';
import { portfolioIdSchema, paginationSchema, isoDateSchema, transactionTypeSchema, cashRateSchema, portfolioBodySchema } from './_schemas.js';
import { withLock } from '../utils/locks.js';
import { readPortfolioState, writePortfolioState } from '../data/portfolioState.js';

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
  };
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function paginateRows<T>(rows: T[], { page = 1, perPage = 50 }: { page?: number; perPage?: number } = {}) {
  const total = rows.length;
  const normalizedPerPage = Number.isFinite(perPage) && perPage > 0 ? perPage : 50;
  const totalPages = total === 0 ? 0 : Math.ceil(total / normalizedPerPage);
  const safePage = totalPages === 0 ? Math.max(1, page) : Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * normalizedPerPage;
  const items = rows.slice(start, start + normalizedPerPage);
  return { items, meta: { page: safePage, per_page: normalizedPerPage, total, total_pages: totalPages } };
}

// ── Route plugin ─────────────────────────────────────────────────────────────

const portfolioRoutes: FastifyPluginAsyncZod<PortfolioRouteContext> = async (app, opts) => {
  const { getStorage } = opts;

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

      await withLock(`portfolio:${id}`, async () => {
        const storage = await getStorage();
        await writePortfolioState(storage, id, {
          transactions: payload.transactions ?? [],
          signals: payload.signals ?? {},
          settings: payload.settings,
          cash: payload.cash ?? { currency: 'USD', apyTimeline: [] },
        });
      });

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
};

export default portfolioRoutes;

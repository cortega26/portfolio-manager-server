// server/routes/analytics.ts
// Analytics routes: returns/daily, nav/daily, roi/daily, benchmarks/summary, admin/cash-rate
// These mirror the Express routes in server/app.js.

import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import type { ServerConfig } from '../types/config.js';
import type { StorageAdapter } from './portfolio.js';
import type { HistoricalPriceLoader } from './prices.js';
import type { ReturnRow } from '../finance/returns.js';

import createPerformanceHistoryService from '../services/performanceHistory.js';
import { summarizeReturns } from '../finance/returns.js';
import { computeMaxDrawdown } from '../finance/returns.js';
import { computeMoneyWeightedReturn, computeMatchedBenchmarkMoneyWeightedReturn } from '../finance/returns.js';
import { weightsFromState } from '../finance/portfolio.js';
import { toDateKey } from '../finance/cash.js';
import { roundDecimal } from '../finance/decimal.js';
import { computeTradingDayAge } from '../utils/calendar.js';
import { isoDateSchema, portfolioIdSchema } from './_schemas.js';

interface AnalyticsCache {
  get(key: string): unknown | undefined;
  set(key: string, payload: unknown): void;
  flush(): void;
}

interface AnalyticsRouteContext extends FastifyPluginOptions {
  config: ServerConfig;
  getStorage: () => Promise<StorageAdapter>;
  historicalPriceLoader: HistoricalPriceLoader;
  analyticsCache?: AnalyticsCache;
}

const MATCHED_MWR_BENCHMARKS = [
  { key: 'spy', ticker: 'SPY' },
  { key: 'qqq', ticker: 'QQQ' },
] as const;

function filterRowsByRange(
  rows: Array<Record<string, unknown>>,
  from: string | null,
  to: string | null,
) {
  return rows.filter((row) => {
    const date = row['date'];
    if (typeof date !== 'string') return true;
    if (from && date < from) return false;
    if (to && date > to) return false;
    return true;
  });
}

function paginateRows<T>(
  rows: T[],
  { page = 1, perPage = 100 }: { page?: number; perPage?: number } = {},
) {
  const total = rows.length;
  const normalizedPerPage = Number.isFinite(perPage) && perPage > 0 ? perPage : 100;
  const totalPages = total === 0 ? 0 : Math.ceil(total / normalizedPerPage);
  const safePage =
    totalPages === 0 ? Math.max(1, page) : Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * normalizedPerPage;
  const end = start + normalizedPerPage;
  const items = rows.slice(start, end);
  return {
    items,
    meta: {
      page: safePage,
      per_page: normalizedPerPage,
      total,
      total_pages: totalPages,
    },
  };
}

function normalizeScopedPortfolioId(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function filterRowsByPortfolioScope(
  rows: Array<Record<string, unknown>>,
  portfolioId: unknown,
) {
  const normalizedPortfolioId = normalizeScopedPortfolioId(portfolioId);
  if (!normalizedPortfolioId) {
    const unscoped = rows.filter(
      (row) =>
        typeof row['portfolio_id'] !== 'string' || (row['portfolio_id'] as string).trim().length === 0,
    );
    return unscoped.length > 0 ? unscoped : rows;
  }
  return rows.filter((row) => row['portfolio_id'] === normalizedPortfolioId);
}

function buildAdjustedPriceMap(
  rows: Array<Record<string, unknown>>,
  ticker: string,
  { from, to }: { from?: string | null; to?: string | null } = {},
) {
  const normalizedTicker = typeof ticker === 'string' ? ticker.trim().toUpperCase() : '';
  const map = new Map<string, number>();
  for (const row of rows) {
    const rowTicker = typeof row['ticker'] === 'string' ? (row['ticker'] as string).trim().toUpperCase() : '';
    const date = typeof row['date'] === 'string' ? (row['date'] as string).trim() : '';
    const price = Number.parseFloat(
      String(row['adj_close'] ?? row['adjClose'] ?? row['close'] ?? row['price'] ?? ''),
    );
    if (
      rowTicker !== normalizedTicker ||
      !date ||
      (from && date < from) ||
      (to && date > to) ||
      !Number.isFinite(price) ||
      price <= 0
    ) {
      continue;
    }
    map.set(date, price);
  }
  return new Map(Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])));
}

// ── Query schemas ─────────────────────────────────────────────────────────────

const rangeQuerySchema = z.object({
  portfolioId: portfolioIdSchema.optional().nullable(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(500).default(100),
});

const returnsQuerySchema = z.object({
  portfolioId: portfolioIdSchema.optional().nullable(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  views: z
    .string()
    .optional()
    .transform((value) => {
      if (!value) return ['port', 'excash', 'spy', 'bench'];
      return Array.from(
        new Set(
          value
            .split(',')
            .map((item) => item.trim().toLowerCase())
            .filter(Boolean),
        ),
      );
    }),
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(500).default(100),
});

const cashRateBodySchema = z.object({
  effective_date: isoDateSchema,
  apy: z.coerce.number().finite(),
});

// ── Response schemas ──────────────────────────────────────────────────────────

const PaginationMetaSchema = z.object({
  page: z.number(),
  per_page: z.number(),
  total: z.number(),
  total_pages: z.number(),
});

const ServiceErrorSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
});

const ReturnsDailyResponseSchema = z.object({
  series: z.record(z.string(), z.unknown()),
  meta: PaginationMetaSchema,
});

const NavDailyResponseSchema = z.object({
  data: z.array(z.record(z.string(), z.unknown())),
  meta: PaginationMetaSchema,
});

const RoiDailyResponseSchema = z.record(z.string(), z.unknown());

const BenchmarksSummaryResponseSchema = z.object({
  summary: z.record(z.string(), z.number()),
  max_drawdown: z
    .object({
      value: z.number(),
      peak_date: z.string(),
      trough_date: z.string(),
    })
    .nullable(),
  drag: z.object({ vs_self: z.number(), allocation: z.number() }),
  money_weighted: z.object({
    portfolio: z.number(),
    benchmarks: z.record(z.string(), z.number().nullable()),
    start_date: z.string().nullable(),
    end_date: z.string().nullable(),
    method: z.string(),
    basis: z.string(),
    partial: z.boolean(),
  }),
});

// ── Route plugin ──────────────────────────────────────────────────────────────

const analyticsRoutes: FastifyPluginAsyncZod<AnalyticsRouteContext> = async (app, opts) => {
  const { getStorage, historicalPriceLoader, config, analyticsCache } = opts;
  const featureFlags = config.featureFlags ?? {};
  const freshness = config as unknown as { freshness?: { maxStaleTradingDays?: number } };
  const maxStaleTradingDays = (() => {
    const val = freshness.freshness?.maxStaleTradingDays;
    if (Number.isFinite(val) && (val as number) >= 0) return Math.round(val as number);
    return 3;
  })();
  const cacheTtlSeconds = (() => {
    const ttl = (config as unknown as { cache?: { ttlSeconds?: number } }).cache?.ttlSeconds;
    return typeof ttl === 'number' && ttl > 0 ? Math.round(ttl) : 0;
  })();

  const performanceHistory = createPerformanceHistoryService({
    getStorage,
    priceLoader: historicalPriceLoader,
    logger: app.log as unknown as null,
    config,
  } as Parameters<typeof createPerformanceHistoryService>[0]);

  async function ensureCashFeature(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!featureFlags.cashBenchmarks) {
      await reply.code(404).send({
        error: 'CASH_BENCHMARKS_DISABLED',
        message: 'Cash benchmarks feature is disabled.',
      });
    }
  }

  // ── GET /returns/daily ────────────────────────────────────────────────────
  app.get(
    '/returns/daily',
    {
      preHandler: ensureCashFeature,
      schema: {
        querystring: returnsQuerySchema,
        response: { 200: ReturnsDailyResponseSchema, 503: ServiceErrorSchema },
      },
    },
    async (request, reply) => {
      const query = request.query as {
        from?: string;
        to?: string;
        views: string[];
        page: number;
        per_page: number;
        portfolioId?: string | null;
      };
      const { from, to, views, page, per_page: perPage, portfolioId } = query;

      const cacheKey = [
        'returns',
        portfolioId ?? '',
        from ?? '',
        to ?? '',
        (views ?? []).slice().sort().join(','),
        page,
        perPage,
      ].join(':');

      const cached = analyticsCache?.get(cacheKey);
      if (cached !== undefined) {
        return app.sendWithEtag(request, reply, cached, cacheTtlSeconds > 0 ? cacheTtlSeconds : undefined);
      }

      let storage = await getStorage();
      let rows = filterRowsByRange(
        filterRowsByPortfolioScope(await storage.readTable('returns_daily'), portfolioId),
        from ?? null,
        to ?? null,
      );

      const needsRepair =
        rows.length === 0 ||
        (typeof from === 'string' && from.trim().length > 0 && (!rows[0]?.['date'] || (rows[0]['date'] as string) > from)) ||
        (typeof to === 'string' && to.trim().length > 0 && (() => { const last = rows[rows.length - 1]; return !last?.['date'] || (last['date'] as string) < to; })());

      if (needsRepair) {
        try {
          await performanceHistory.getLegacyRows({ from, to, portfolioId });
          storage = await getStorage();
          rows = filterRowsByRange(
            filterRowsByPortfolioScope(await storage.readTable('returns_daily'), portfolioId),
            from ?? null,
            to ?? null,
          );
        } catch (repairError) {
          app.log.error({ error: (repairError as Error).message, from, to }, 'historical_performance_repair_failed');
          return reply.code(503).send({
            error: 'RETURNS_REPAIR_FAILED',
            message: 'Historical returns could not be rebuilt from local transactions and prices.',
          });
        }
      }

      const { items, meta } = paginateRows(rows, { page, perPage });
      const viewMapping: Record<string, string> = {
        port: 'r_port',
        excash: 'r_ex_cash',
        spy: 'r_spy_100',
        bench: 'r_bench_blended',
      };

      const series: Record<string, unknown> = {};
      for (const view of (views ?? [])) {
        const key = viewMapping[view];
        if (!key) continue;
        series[key] = items.map((row) => ({ date: row['date'], value: row[key] }));
      }
      series['r_cash'] = items.map((row) => ({ date: row['date'], value: row['r_cash'] }));

      if (Object.keys(series).length === 1) {
        series['r_port'] = items.map((row) => ({ date: row['date'], value: row['r_port'] }));
      }

      const payload = { series, meta };
      analyticsCache?.set(cacheKey, payload);
      return app.sendWithEtag(request, reply, payload, cacheTtlSeconds > 0 ? cacheTtlSeconds : undefined);
    },
  );

  // ── GET /nav/daily ────────────────────────────────────────────────────────
  app.get(
    '/nav/daily',
    {
      preHandler: ensureCashFeature,
      schema: {
        querystring: rangeQuerySchema,
        response: { 200: NavDailyResponseSchema },
      },
    },
    async (request, reply) => {
      const query = request.query as {
        from?: string;
        to?: string;
        page: number;
        per_page: number;
        portfolioId?: string | null;
      };
      const { from, to, page, per_page: perPage, portfolioId } = query;

      let storage = await getStorage();
      let rows = filterRowsByRange(
        filterRowsByPortfolioScope(await storage.readTable('nav_snapshots'), portfolioId),
        from ?? null,
        to ?? null,
      );

      if (rows.length === 0) {
        await performanceHistory.getLegacyRows({ from, to, portfolioId });
        storage = await getStorage();
        rows = filterRowsByRange(
          filterRowsByPortfolioScope(await storage.readTable('nav_snapshots'), portfolioId),
          from ?? null,
          to ?? null,
        );
      }

      const { items, meta } = paginateRows(rows, { page, perPage });
      const data = items.map((row) => {
        const weights = weightsFromState({
          nav: row['portfolio_nav'] as number,
          cash: row['cash_balance'] as number,
          riskValue: row['risk_assets_value'] as number,
        });
        return {
          date: row['date'],
          portfolio_nav: row['portfolio_nav'],
          ex_cash_nav: row['ex_cash_nav'],
          cash_balance: row['cash_balance'],
          risk_assets_value: row['risk_assets_value'],
          stale_price: Boolean(row['stale_price']),
          weights,
        };
      });

      const payload = { data, meta };
      return app.sendWithEtag(request, reply, payload);
    },
  );

  // ── GET /roi/daily ────────────────────────────────────────────────────────
  app.get(
    '/roi/daily',
    {
      preHandler: ensureCashFeature,
      schema: {
        querystring: rangeQuerySchema,
        response: { 200: RoiDailyResponseSchema, 503: ServiceErrorSchema },
      },
    },
    async (request, reply) => {
      const query = request.query as {
        from?: string;
        to?: string;
        portfolioId?: string | null;
      };
      const { from, to, portfolioId } = query;
      try {
        const payload = await performanceHistory.getRoiPayload({ from, to, portfolioId });
        return app.sendWithEtag(request, reply, payload);
      } catch (repairError) {
        app.log.error({ error: (repairError as Error).message, from, to }, 'roi_rebuild_failed');
        return reply.code(503).send({
          error: 'RETURNS_REPAIR_FAILED',
          message: 'Historical returns could not be rebuilt from local transactions and prices.',
        });
      }
    },
  );

  // ── GET /benchmarks/summary ───────────────────────────────────────────────
  app.get(
    '/benchmarks/summary',
    {
      preHandler: ensureCashFeature,
      schema: {
        querystring: rangeQuerySchema,
        response: { 200: BenchmarksSummaryResponseSchema, 503: ServiceErrorSchema },
      },
    },
    async (request, reply) => {
      const query = request.query as {
        from?: string;
        to?: string;
        portfolioId?: string | null;
      };
      const { from, to, portfolioId } = query;

      let storage = await getStorage();
      let [returnsTable, navRows, transactions, priceRows] = await Promise.all([
        storage.readTable('returns_daily'),
        storage.readTable('nav_snapshots'),
        storage.readTable('transactions'),
        storage.readTable('prices'),
      ]);

      let filteredRows = filterRowsByRange(
        filterRowsByPortfolioScope(returnsTable, portfolioId),
        from ?? null,
        to ?? null,
      );

      if (filteredRows.length === 0) {
        await performanceHistory.getLegacyRows({ from, to, portfolioId });
        storage = await getStorage();
        [returnsTable, navRows, transactions, priceRows] = await Promise.all([
          storage.readTable('returns_daily'),
          storage.readTable('nav_snapshots'),
          storage.readTable('transactions'),
          storage.readTable('prices'),
        ]);
        filteredRows = filterRowsByRange(
          filterRowsByPortfolioScope(returnsTable, portfolioId),
          from ?? null,
          to ?? null,
        );
      }

      const rows = filteredRows
        .slice()
        .sort((a, b) => (a['date'] as string).localeCompare(b['date'] as string));

      const todayKey = toDateKey(new Date()) as string;
      let referenceKey = to ? (toDateKey(to) as string) : todayKey;
      if (referenceKey > todayKey) referenceKey = todayKey;

      const latestDate = rows.length > 0 ? (rows[rows.length - 1]?.['date'] as string | undefined ?? null) : null;
      const referenceDate = new Date(`${referenceKey}T00:00:00Z`);
      const tradingDayAge = computeTradingDayAge(latestDate, referenceDate);

      if (!latestDate || tradingDayAge > maxStaleTradingDays) {
        return reply.code(503).send({ error: 'STALE_DATA' });
      }

      const returnRows = rows as unknown as ReturnRow[];
      const summary = summarizeReturns(returnRows);

      let moneyWeighted = 0;
      let moneyWeightedPeriod: { start_date: string | null; end_date: string | null } = {
        start_date: null,
        end_date: null,
      };
      let moneyWeightedBenchmarks: Record<string, number | null> = { spy: null, qqq: null };
      let moneyWeightedPartial = false;

      if (rows.length > 0) {
        const startKey = rows[0]?.['date'] as string;
        const endKey = rows[rows.length - 1]?.['date'] as string;
        const scopedTransactions = filterRowsByPortfolioScope(transactions, portfolioId);
        const scopedNavRows = filterRowsByPortfolioScope(navRows, portfolioId);

        const xirr = computeMoneyWeightedReturn({
          transactions: (scopedTransactions as unknown) as NonNullable<Parameters<typeof computeMoneyWeightedReturn>[0]['transactions']>,
          navRows: (scopedNavRows as unknown) as Parameters<typeof computeMoneyWeightedReturn>[0]['navRows'],
          startDate: startKey,
          endDate: endKey,
        });
        moneyWeighted = roundDecimal(xirr ?? 0, 8).toNumber();
        moneyWeightedPeriod = { start_date: startKey, end_date: endKey };

        const elapsedDays = Math.round(
          (new Date(`${endKey}T00:00:00Z`).getTime() -
            new Date(`${startKey}T00:00:00Z`).getTime()) /
            86_400_000,
        );
        moneyWeightedPartial = elapsedDays < 365;

        moneyWeightedBenchmarks = MATCHED_MWR_BENCHMARKS.reduce(
          (acc, benchmark) => {
            const benchmarkPriceMap = buildAdjustedPriceMap(priceRows, benchmark.ticker, {
              from: startKey,
              to: endKey,
            });
            const benchmarkMwr = computeMatchedBenchmarkMoneyWeightedReturn({
              benchmarkPrices: (benchmarkPriceMap as unknown) as Parameters<typeof computeMatchedBenchmarkMoneyWeightedReturn>[0]['benchmarkPrices'],
              transactions: (scopedTransactions as unknown) as NonNullable<Parameters<typeof computeMatchedBenchmarkMoneyWeightedReturn>[0]['transactions']>,
              navRows: (scopedNavRows as unknown) as Parameters<typeof computeMatchedBenchmarkMoneyWeightedReturn>[0]['navRows'],
              startDate: startKey,
              endDate: endKey,
            });
            acc[benchmark.key] = benchmarkMwr ? roundDecimal(benchmarkMwr, 8).toNumber() : null;
            return acc;
          },
          { spy: null, qqq: null } as Record<string, number | null>,
        );
      }

      const drawdownResult = computeMaxDrawdown(returnRows);
      const maxDrawdown = drawdownResult
        ? {
            value: drawdownResult.maxDrawdown,
            peak_date: drawdownResult.peakDate,
            trough_date: drawdownResult.troughDate,
          }
        : null;

      const dragVsSelf = Number((summary.r_ex_cash - summary.r_port).toFixed(6));
      const allocationDrag = Number((summary.r_spy_100 - summary.r_bench_blended).toFixed(6));

      const payload = {
        summary,
        max_drawdown: maxDrawdown,
        drag: { vs_self: dragVsSelf, allocation: allocationDrag },
        money_weighted: {
          portfolio: moneyWeighted,
          benchmarks: moneyWeightedBenchmarks,
          ...moneyWeightedPeriod,
          method: 'xirr',
          basis: 'matched_external_flows',
          partial: moneyWeightedPartial,
        },
      };

      return app.sendWithEtag(request, reply, payload);
    },
  );

  // ── POST /admin/cash-rate ─────────────────────────────────────────────────
  app.post(
    '/admin/cash-rate',
    {
      preHandler: ensureCashFeature,
      schema: {
        body: cashRateBodySchema,
        response: {
          200: z.object({ status: z.literal('ok') }),
        },
      },
    },
    async (request) => {
      const { effective_date: effectiveDate, apy } = request.body;
      const storage = await getStorage();
      await storage.upsertRow('cash_rates', { effective_date: effectiveDate, apy }, ['effective_date']);
      return { status: 'ok' as const };
    },
  );
};

export default analyticsRoutes;

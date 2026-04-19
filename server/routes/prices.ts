// server/routes/prices.ts
// GET /api/prices/:symbol   — historical price series, ETag support
// GET /api/prices/bulk      — multi-symbol bulk fetch
import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { FastifyPluginOptions } from 'fastify';
import { computeTradingDayAge } from '../utils/calendar.js';
import { isoDateSchema, tickerSchema } from './_schemas.js';

const MAX_BULK_PRICE_SYMBOLS = 64;

function normalizePricingStatusSummary(
  symbolMeta: Record<string, unknown>,
  errors: Record<string, unknown>,
): Record<string, unknown> {
  const summary: {
    status: string;
    liveSymbols: string[];
    eodSymbols: string[];
    cacheSymbols: string[];
    degradedSymbols: string[];
    unavailableSymbols: string[];
  } = {
    status: 'unavailable',
    liveSymbols: [],
    eodSymbols: [],
    cacheSymbols: [],
    degradedSymbols: [],
    unavailableSymbols: [],
  };

  for (const [symbol, meta] of Object.entries(symbolMeta)) {
    const status = typeof (meta as Record<string, unknown>)?.['status'] === 'string'
      ? (meta as Record<string, string>)['status']
      : 'unavailable';
    if (status === 'live') { summary.liveSymbols.push(symbol); continue; }
    if (status === 'eod_fresh') { summary.eodSymbols.push(symbol); continue; }
    if (status === 'cache_fresh') { summary.cacheSymbols.push(symbol); continue; }
    if (status === 'degraded') { summary.degradedSymbols.push(symbol); continue; }
    summary.unavailableSymbols.push(symbol);
  }

  for (const symbol of Object.keys(errors)) {
    if (!summary.unavailableSymbols.includes(symbol)) {
      summary.unavailableSymbols.push(symbol);
    }
  }

  if (summary.unavailableSymbols.length > 0) {
    summary.status = 'unavailable';
  } else if (summary.degradedSymbols.length > 0) {
    summary.status = 'degraded';
  } else if (summary.liveSymbols.length > 0) {
    summary.status = 'live';
  } else if (summary.eodSymbols.length > 0) {
    summary.status = 'eod_fresh';
  } else if (summary.cacheSymbols.length > 0) {
    summary.status = 'cache_fresh';
  }

  return summary;
}

export interface HistoricalPriceLoader {
  fetchSeries(
    symbol: string,
    opts?: { range?: string; latestOnly?: boolean },
  ): Promise<{
    prices: Array<{ date: string; close?: number; adjClose?: number }>;
    etag?: string;
    cacheHit?: boolean;
    resolution?: unknown;
  }>;
}

export interface PricesRouteContext extends FastifyPluginOptions {
  historicalPriceLoader: HistoricalPriceLoader;
  config: {
    freshness: { maxStaleTradingDays: number };
    cache: { price: { ttlSeconds: number; liveOpenTtlSeconds: number; liveClosedTtlSeconds: number } };
  };
  marketClock?: () => { isOpen: boolean };
}

const PricePointSchema = z.object({
  date: z.string(),
  close: z.number(),
});

const PriceBulkResponseSchema = z.object({
  series: z.record(z.string(), z.array(PricePointSchema)),
  errors: z.record(
    z.string(),
    z.object({
      code: z.string(),
      status: z.number(),
      message: z.string(),
    }),
  ),
  metadata: z.object({
    cache: z.record(z.string(), z.string()),
    etags: z.record(z.string(), z.string()),
    symbols: z.record(z.string(), z.unknown()),
    summary: z.unknown(),
  }),
});

function normalizeBulkSymbols(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === 'string') return raw.split(',');
  return [];
}

const pricesRoutes: FastifyPluginAsyncZod<PricesRouteContext> = async (app, opts) => {
  const { historicalPriceLoader, config } = opts;
  const maxStaleTradingDays = config.freshness.maxStaleTradingDays;
  const priceCacheTtlSeconds = config.cache.price.ttlSeconds;
  const priceCacheControlHeader = `private, max-age=${priceCacheTtlSeconds}`;

  // ── GET /prices/bulk ─────────────────────────────────────────────────────
  // MUST be registered before /:symbol to prevent "bulk" being matched as a symbol
  app.get(
    '/prices/bulk',
    {
      schema: {
        querystring: z.object({
          symbols: z.string(),
          range: z.string().optional(),
          latest: z.string().optional(),
        }),
        response: {
          200: PriceBulkResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { symbols: rawSymbols, range, latest } = request.query;
      const latestOnly = latest === '1' || latest === 'true';

      const normalizedSymbols = Array.from(
        new Set(
          normalizeBulkSymbols(rawSymbols)
            .map((v) => (typeof v === 'string' ? v.trim().toUpperCase() : ''))
            .filter((v) => v && /^[A-Za-z0-9._-]{1,32}$/.test(v)),
        ),
      ).slice(0, MAX_BULK_PRICE_SYMBOLS);

      if (normalizedSymbols.length === 0) {
        const e = Object.assign(
          new Error('At least one valid symbol is required.'),
          { statusCode: 400, code: 'INVALID_SYMBOLS' },
        );
        throw e;
      }

      const results = await Promise.all(
        normalizedSymbols.map(async (symbol) => {
          try {
            const result = await historicalPriceLoader.fetchSeries(symbol, {
              range: range ?? '1y',
              latestOnly,
            });
            return { symbol, status: 'fulfilled' as const, result };
          } catch (error) {
            return { symbol, status: 'rejected' as const, error };
          }
        }),
      );

      const series: Record<string, Array<{ date: string; close: number }>> = {};
      const errors: Record<string, { code: string; status: number; message: string }> = {};
      const cacheMeta: Record<string, string> = {};
      const etagMeta: Record<string, string> = {};
      const symbolMeta: Record<string, unknown> = {};
      let allHits = true;

      for (const entry of results) {
        if (entry.status === 'fulfilled') {
          const { symbol, result } = entry;
          const { prices, etag, cacheHit } = result;
          const resolution = result.resolution as Record<string, unknown> | null | undefined;
          const resolutionStatus = typeof resolution?.['status'] === 'string' ? resolution['status'] : '';

          symbolMeta[symbol] = resolution ?? {
            status: cacheHit ? 'cache_fresh' : 'eod_fresh',
            source: cacheHit ? 'cache' : 'historical',
          };

          // market_closed is expected when the exchange is not trading and no
          // cached data exists yet.  Report it with a dedicated code so the
          // frontend can show "market closed" instead of a hard error.
          if (resolutionStatus === 'market_closed') {
            errors[symbol] = {
              code: 'MARKET_CLOSED',
              status: 200,
              message: 'Market is closed and no cached price is available yet.',
            };
            series[symbol] = [];
            cacheMeta[symbol] = 'MISS';
            if (etag) etagMeta[symbol] = etag;
            allHits = false;
            continue;
          }

          const latestDate = prices.length > 0 ? prices[prices.length - 1]?.date ?? null : null;
          const tradingDayAge = computeTradingDayAge(latestDate);

          if (!latestDate || tradingDayAge > maxStaleTradingDays) {
            errors[symbol] = {
              code: 'STALE_DATA',
              status: 503,
              message: 'Historical prices are stale for this symbol.',
            };
            series[symbol] = [];
            symbolMeta[symbol] = {
              status: 'unavailable',
              source: resolution?.['source'] ?? 'none',
              warnings: ['PERSISTED_CLOSE_STALE_REJECTED'],
            };
          } else {
            series[symbol] = prices.map((p) => ({
              date: p.date,
              close: p.close ?? p.adjClose ?? 0,
            }));
          }

          cacheMeta[symbol] = cacheHit ? 'HIT' : 'MISS';
          if (etag) etagMeta[symbol] = etag;
          if (!cacheHit) allHits = false;
        } else {
          const { symbol, error } = entry as { symbol: string; error: unknown };
          const err = error as { code?: string; status?: number; statusCode?: number; message?: string };
          symbolMeta[symbol] = { status: 'unavailable', source: 'none' };
          errors[symbol] = {
            code: err?.code ?? 'PRICE_FETCH_FAILED',
            status: err?.status ?? err?.statusCode ?? 502,
            message: err?.message ?? 'Failed to fetch historical prices.',
          };
          series[symbol] = [];
          cacheMeta[symbol] = 'MISS';
          allHits = false;
        }
      }

      reply.header('Cache-Control', priceCacheControlHeader);
      reply.header('X-Cache', allHits ? 'HIT' : 'MISS');

      return {
        series,
        errors,
        metadata: { cache: cacheMeta, etags: etagMeta, symbols: symbolMeta, summary: normalizePricingStatusSummary(symbolMeta, errors) },
      };
    },
  );

  // ── GET /prices/:symbol ──────────────────────────────────────────────────
  app.get(
    '/prices/:symbol',
    {
      schema: {
        params: z.object({ symbol: z.string() }),
        querystring: z.object({
          range: z.string().optional(),
          from: isoDateSchema.optional(),
          to: isoDateSchema.optional(),
          latest: z.string().optional(),
          adjusted: z.coerce.boolean().default(true),
        }),
      },
    },
    async (request, reply) => {
      const { symbol: rawSymbol } = request.params;
      const symbolResult = tickerSchema.safeParse(rawSymbol);
      if (!symbolResult.success) {
        return reply.code(400).send({ error: 'INVALID_SYMBOL', message: 'Invalid symbol.' });
      }
      const symbol = symbolResult.data;
      const { range, latest } = request.query;
      const latestOnly = latest === '1' || latest === 'true';

      let result: Awaited<ReturnType<HistoricalPriceLoader['fetchSeries']>>;
      try {
        result = await historicalPriceLoader.fetchSeries(symbol, {
          range: range ?? '1y',
          latestOnly,
        });
      } catch {
        return reply.code(502).send({ error: 'PRICE_FETCH_FAILED', message: 'Failed to fetch historical prices.' });
      }

      const { prices, etag, cacheHit } = result;
      const resolution = result.resolution as Record<string, unknown> | null | undefined;
      const resolutionStatus = typeof resolution?.['status'] === 'string' ? resolution['status'] : '';

      // Market closed and no cached data — expected, not an error.
      if (resolutionStatus === 'market_closed') {
        return reply.code(200).send({ error: 'MARKET_CLOSED', message: 'Market is closed and no cached price is available yet.' });
      }

      const latestDate = prices.length > 0 ? prices[prices.length - 1]?.date ?? null : null;
      const tradingDayAge = computeTradingDayAge(latestDate);

      if (!latestDate || tradingDayAge > maxStaleTradingDays) {
        // Return bare { error: 'STALE_DATA' } to match Express contract (no message field)
        return reply.code(503).send({ error: 'STALE_DATA' });
      }

      const clientETag = request.headers['if-none-match'];
      if (cacheHit && clientETag && etag && clientETag === etag) {
        reply.raw.writeHead(304, {
          ETag: etag,
          'Cache-Control': priceCacheControlHeader,
          'X-Cache': 'HIT',
        });
        reply.raw.end();
        return reply;
      }

      if (etag) reply.header('ETag', etag);
      reply.header('Cache-Control', priceCacheControlHeader);
      reply.header('X-Cache', cacheHit ? 'HIT' : 'MISS');

      return prices.map((p) => ({
        date: p.date,
        close: p.close ?? p.adjClose ?? 0,
      }));
    },
  );
};

export default pricesRoutes;

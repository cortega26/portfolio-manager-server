// server/routes/signals.ts
// POST /api/signals — evaluate signal preview for a portfolio body
import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { FastifyPluginOptions } from 'fastify';
import { portfolioBodySchema } from './_schemas.js';
import { computeTradingDayAge } from '../utils/calendar.js';
import type { HistoricalPriceLoader } from './prices.js';
import { buildPortfolioSignalRows } from '../services/signalNotifications.js';
import { sortTransactions, projectStateUntil } from '../finance/portfolio.js';
import { isOpenSignalHolding } from '../../shared/signals.js';
import { ensureTransactionUids } from '../services/portfolioTransactions.js';
import { buildFreshPriceSnapshot } from './_helpers.js';

export interface SignalsRouteContext extends FastifyPluginOptions {
  historicalPriceLoader: HistoricalPriceLoader;
  config: {
    freshness: { maxStaleTradingDays: number };
  };
  marketClock?: () => { isOpen: boolean; isBeforeOpen?: boolean; lastTradingDate?: string | null; nextTradingDate?: string | null };
}

type PriceMeta = {
  status: string;
  source?: string | null;
  provider?: string | null;
  warnings?: string[];
  asOf?: string | null;
};

type SignalTransaction = { date?: string };

function normalizePricingStatusSummary(
  symbolMeta: Record<string, PriceMeta>,
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
    const status = typeof meta?.status === 'string' ? meta.status : 'unavailable';
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

const signalsRoutes: FastifyPluginAsyncZod<SignalsRouteContext> = async (app, opts) => {
  const { historicalPriceLoader, config } = opts;
  const maxStaleTradingDays = config.freshness.maxStaleTradingDays;

  // ── Response schema ───────────────────────────────────────────────────────
  const SignalsResponseSchema = z.object({
    rows: z.array(z.record(z.string(), z.unknown())),
    prices: z.record(z.string(), z.number()),
    errors: z.record(z.string(), z.unknown()),
    pricing: z.object({
      symbols: z.record(z.string(), z.unknown()),
      summary: z.record(z.string(), z.unknown()),
    }),
    market: z.object({
      isOpen: z.boolean(),
      isBeforeOpen: z.boolean().nullable(),
      lastTradingDate: z.string().nullable(),
      nextTradingDate: z.string().nullable(),
    }),
  });

  app.post(
    '/signals',
    {
      preHandler: app.requireAuth,
      schema: {
        body: portfolioBodySchema,
        response: { 200: SignalsResponseSchema },
      },
    },
    async (request, reply) => {
      const { transactions = [], signals = {} } = request.body;

      const normalizedTransactions = ensureTransactionUids(transactions as never[], 'signals-preview') as unknown[];
      const sortedTransactions = sortTransactions(normalizedTransactions as never[]);
      const lastTransactionDate =
        sortedTransactions.length > 0
          ? ((sortedTransactions[sortedTransactions.length - 1] as SignalTransaction).date ?? null)
          : null;
      const projectedState = lastTransactionDate
        ? projectStateUntil(sortedTransactions, lastTransactionDate)
        : { holdings: new Map<string, unknown>() };
      const openTickers = Array.from((projectedState.holdings as Map<string, unknown>).entries())
        .filter(([, quantity]) => isOpenSignalHolding(quantity))
        .map(([ticker]) => ticker as string)
        .sort((a, b) => a.localeCompare(b));

      // Fetch latest prices for open tickers
      const prices: Record<string, number> = {};
      const asOfMap: Record<string, string | null> = {};
      const pricingErrors: Record<string, unknown> = {};
      const symbolMeta: Record<string, PriceMeta> = {};

      await Promise.all(
        openTickers.map(async (symbol) => {
          try {
            const result = await historicalPriceLoader.fetchSeries(symbol, { range: '1y', latestOnly: true });
            symbolMeta[symbol] = (result.resolution as PriceMeta) ?? {
              status: 'unavailable',
              source: 'none',
              provider: null,
              warnings: [],
              asOf: null,
            };
            const latest = Array.isArray(result.prices) ? result.prices[result.prices.length - 1] : null;
            const latestSnapshot = buildFreshPriceSnapshot(latest, maxStaleTradingDays);
            const latestDate = latestSnapshot.asOf;
            const tradingDayAge = computeTradingDayAge(latestDate);
            if (!latestDate || (tradingDayAge !== null && tradingDayAge > maxStaleTradingDays)) {
              const existingMeta = symbolMeta[symbol];
              const existingWarnings = Array.isArray(existingMeta?.warnings) ? existingMeta.warnings : [];
              const warning = existingMeta?.source === 'persisted' ? 'PERSISTED_CLOSE_STALE_REJECTED' : '';
              symbolMeta[symbol] = {
                ...existingMeta,
                status: 'unavailable',
                asOf: latestDate,
                ...(warning ? { warnings: Array.from(new Set([...existingWarnings, warning])) } : {}),
              };
              pricingErrors[symbol] = { code: 'STALE_DATA', status: 503, message: 'Historical prices are stale for this symbol.' };
              return;
            }
            const rawClose = latestSnapshot.price;
            if (!Number.isFinite(rawClose)) {
              symbolMeta[symbol] = { ...symbolMeta[symbol], status: 'unavailable', asOf: latestDate };
              pricingErrors[symbol] = { code: 'PRICE_FETCH_FAILED', status: 502, message: 'Failed to fetch historical prices.' };
              return;
            }
            prices[symbol] = rawClose as number;
            asOfMap[symbol] = latestDate;
          } catch (error) {
            const err = error as { code?: string; status?: number; statusCode?: number; message?: string };
            symbolMeta[symbol] = { status: 'unavailable', source: 'none', provider: null, warnings: [], asOf: null };
            pricingErrors[symbol] = {
              code: err?.code ?? 'PRICE_FETCH_FAILED',
              status: err?.status ?? err?.statusCode ?? 502,
              message: err?.message ?? 'Failed to fetch historical prices.',
            };
          }
        }),
      );

      const priceSnapshots = new Map<string, { price: number | null; asOf: string | null }>(
        openTickers.map((ticker) => [
          ticker,
          { price: prices[ticker] ?? null, asOf: asOfMap[ticker] ?? null },
        ]),
      );

      const rows = buildPortfolioSignalRows({
        transactions: normalizedTransactions as never[],
        signals,
        priceSnapshots,
      });

      const market = opts.marketClock?.() ?? { isOpen: false };

      return reply.code(200).send({
        rows,
        prices,
        errors: pricingErrors,
        pricing: {
          symbols: symbolMeta,
          summary: normalizePricingStatusSummary(symbolMeta, pricingErrors),
        },
        market: {
          isOpen: market.isOpen ?? false,
          isBeforeOpen: (market as Record<string, unknown>)['isBeforeOpen'] as boolean | null ?? null,
          lastTradingDate: ((market as Record<string, unknown>)['lastTradingDate'] as string | null | undefined) ?? null,
          nextTradingDate: ((market as Record<string, unknown>)['nextTradingDate'] as string | null | undefined) ?? null,
        },
      });
    },
  );
};

export default signalsRoutes;

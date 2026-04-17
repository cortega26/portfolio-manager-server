// server/routes/signals.ts
// POST /api/signals — evaluate signal preview for a portfolio body
import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { FastifyPluginOptions } from 'fastify';
import { portfolioBodySchema } from './_schemas.js';
import { computeTradingDayAge } from '../utils/calendar.js';
import type { HistoricalPriceLoader } from './prices.js';

export interface SignalsRouteContext extends FastifyPluginOptions {
  historicalPriceLoader: HistoricalPriceLoader;
  config: {
    freshness: { maxStaleTradingDays: number };
  };
  marketClock?: () => { isOpen: boolean; isBeforeOpen?: boolean; lastTradingDate?: string | null; nextTradingDate?: string | null };
}

const SignalRowSchema = z.object({
  type: z.string(),
  ticker: z.string().optional(),
  message: z.string(),
  severity: z.enum(['INFO', 'WARNING', 'ALERT']),
});

const SignalsResponseSchema = z.object({
  signals: z.array(SignalRowSchema),
  prices: z.record(z.string(), z.number()),
  errors: z.record(z.string(), z.unknown()),
  pricing: z.object({
    symbols: z.record(z.string(), z.unknown()),
    summary: z.unknown(),
  }),
  market: z.object({
    isOpen: z.boolean(),
    isBeforeOpen: z.boolean().optional(),
    lastTradingDate: z.string().nullable().optional(),
    nextTradingDate: z.string().nullable().optional(),
  }),
});

// Inline the open-holding check (equivalent to shared/signals.js isOpenSignalHolding)
function isOpenSignalHolding(quantity: unknown): boolean {
  const n = typeof quantity === 'number' ? quantity : Number(quantity);
  return Number.isFinite(n) && n > 0;
}

const signalsRoutes: FastifyPluginAsyncZod<SignalsRouteContext> = async (app, opts) => {
  const { historicalPriceLoader, config } = opts;
  const maxStaleTradingDays = config.freshness.maxStaleTradingDays;

  app.post(
    '/signals',
    {
      preHandler: app.requireAuth,
      schema: {
        body: portfolioBodySchema,
        response: {
          200: SignalsResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { transactions = [], signals = {} } = request.body;

      // Derive open tickers from transaction history (simplified projection)
      const holdingsMap = new Map<string, number>();
      for (const tx of transactions) {
        const ticker = (tx as Record<string, unknown>)['ticker'] as string | undefined;
        if (!ticker || ticker === 'CASH') continue;
        const shares = Math.abs(Number((tx as Record<string, unknown>)['shares'] ?? 0));
        const type = (tx as Record<string, unknown>)['type'] as string;
        const current = holdingsMap.get(ticker) ?? 0;
        if (type === 'BUY') {
          holdingsMap.set(ticker, current + shares);
        } else if (type === 'SELL') {
          holdingsMap.set(ticker, Math.max(0, current - shares));
        }
      }

      const openTickers = Array.from(holdingsMap.entries())
        .filter(([, qty]) => isOpenSignalHolding(qty))
        .map(([ticker]) => ticker)
        .sort((a, b) => a.localeCompare(b));

      // Fetch latest prices for open tickers
      const prices: Record<string, number> = {};
      const pricingErrors: Record<string, unknown> = {};
      const symbolMeta: Record<string, unknown> = {};

      await Promise.all(
        openTickers.map(async (symbol) => {
          try {
            const result = await historicalPriceLoader.fetchSeries(symbol, { range: '1y', latestOnly: true });
            const latest = result.prices[result.prices.length - 1];
            if (latest) {
              const latestDate = latest.date;
              const tradingDayAge = computeTradingDayAge(latestDate) ?? 0;
              if (tradingDayAge <= maxStaleTradingDays) {
                prices[symbol] = latest.close ?? latest.adjClose ?? 0;
                symbolMeta[symbol] = result.resolution ?? { status: 'eod_fresh' };
              } else {
                pricingErrors[symbol] = { code: 'STALE_DATA', status: 503 };
                symbolMeta[symbol] = { status: 'unavailable' };
              }
            }
          } catch {
            pricingErrors[symbol] = { code: 'PRICE_FETCH_FAILED', status: 502 };
            symbolMeta[symbol] = { status: 'unavailable' };
          }
        }),
      );

      // Evaluate signals against current prices
      const signalRows: z.infer<typeof SignalRowSchema>[] = [];
      for (const [ticker, qty] of holdingsMap.entries()) {
        if (!isOpenSignalHolding(qty)) continue;
        const tickerSignals = (signals as Record<string, unknown>)[ticker] as Record<string, unknown> | undefined;
        if (!tickerSignals) continue;

        const price = prices[ticker] ?? null;
        if (price === null) continue;

        const buyThreshold = typeof tickerSignals['buyThreshold'] === 'number' ? tickerSignals['buyThreshold'] : null;
        const sellThreshold = typeof tickerSignals['sellThreshold'] === 'number' ? tickerSignals['sellThreshold'] : null;

        if (buyThreshold !== null && price <= buyThreshold) {
          signalRows.push({ type: 'BUY', ticker, message: `${ticker} is at or below buy threshold ($${buyThreshold})`, severity: 'ALERT' });
        }
        if (sellThreshold !== null && price >= sellThreshold) {
          signalRows.push({ type: 'SELL', ticker, message: `${ticker} is at or above sell threshold ($${sellThreshold})`, severity: 'ALERT' });
        }
      }

      const market = opts.marketClock?.() ?? { isOpen: false };

      return reply.code(200).send({
        signals: signalRows,
        prices,
        errors: pricingErrors,
        pricing: { symbols: symbolMeta, summary: null },
        market: {
          isOpen: market.isOpen,
          isBeforeOpen: (market as Record<string, unknown>)['isBeforeOpen'] as boolean | undefined,
          lastTradingDate: (market as Record<string, unknown>)['lastTradingDate'] as string | null | undefined,
          nextTradingDate: (market as Record<string, unknown>)['nextTradingDate'] as string | null | undefined,
        },
      });
    },
  );
};

export default signalsRoutes;

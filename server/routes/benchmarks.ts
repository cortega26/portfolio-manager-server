// server/routes/benchmarks.ts
import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { FastifyPluginOptions } from 'fastify';
import type { ServerConfig } from '../types/config.js';

interface BenchmarksRouteContext extends FastifyPluginOptions {
  config: ServerConfig;
}

const BenchmarkEntrySchema = z.object({
  id: z.string(),
  ticker: z.string(),
  label: z.string(),
  kind: z.string(),
});

const DerivedBenchmarkSchema = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.string(),
});

const BenchmarksResponseSchema = z.object({
  available: z.array(BenchmarkEntrySchema),
  derived: z.array(DerivedBenchmarkSchema),
  defaults: z.array(z.string()),
  priceSymbols: z.array(z.string()),
});

const benchmarksRoutes: FastifyPluginAsyncZod<BenchmarksRouteContext> = async (app, opts) => {
  app.get(
    '/benchmarks',
    {
      schema: {
        response: {
          200: BenchmarksResponseSchema,
        },
      },
    },
    async () => {
      const { available, derived, defaultSelection, priceSymbols } = opts.config.benchmarks;
      return {
        available: available as z.infer<typeof BenchmarkEntrySchema>[],
        derived: derived as z.infer<typeof DerivedBenchmarkSchema>[],
        defaults: defaultSelection,
        priceSymbols,
      };
    },
  );
};

export default benchmarksRoutes;

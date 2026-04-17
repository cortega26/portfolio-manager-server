// server/routes/import.ts
// POST /api/import/csv — import portfolio transactions from the data directory CSV files
// DB Write policy: importCsvPortfolio() manages withLock() internally — satisfies 2.31b.
import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { FastifyPluginOptions } from 'fastify';
import { portfolioIdSchema } from './_schemas.js';

export interface ImportRouteContext extends FastifyPluginOptions {
  dataDir: string;
}

const ImportResponseSchema = z.object({
  imported: z.number(),
  skipped: z.number(),
  errors: z.array(
    z.object({
      row: z.number(),
      message: z.string(),
    }),
  ),
});

const importRoutes: FastifyPluginAsyncZod<ImportRouteContext> = async (app, opts) => {
  const { dataDir } = opts;

  app.post(
    '/import/csv',
    {
      preHandler: app.requireAuth,
      schema: {
        body: z.object({
          portfolioId: portfolioIdSchema,
          dryRun: z.boolean().optional().default(false),
        }),
        response: {
          200: ImportResponseSchema,
        },
      },
    },
    async (request) => {
      const { portfolioId, dryRun } = request.body;

      const { importCsvPortfolio } = await import('../import/csvPortfolioImport.js');
      type ImportFn = (opts: { dataDir?: string; portfolioId?: string; dryRun?: boolean }) => Promise<unknown>;
      const result = await (importCsvPortfolio as ImportFn)({ dataDir, portfolioId, dryRun }) as {
        transactionCount?: number;
        reconciliation?: { summary?: { totalTransactions?: number } };
      };

      return {
        imported: result?.reconciliation?.summary?.totalTransactions ?? result?.transactionCount ?? 0,
        skipped: 0,
        errors: [] as Array<{ row: number; message: string }>,
      };
    },
  );
};

export default importRoutes;

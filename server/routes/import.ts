// server/routes/import.ts
// POST /api/import/csv — import portfolio transactions
// DB Write policy: importCsvPortfolio() manages withLock() internally — satisfies 2.31b.
import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { FastifyPluginOptions } from 'fastify';
import { portfolioIdSchema } from './_schemas.js';

export interface ImportRouteContext extends FastifyPluginOptions {
  dataDir: string;
  analyticsCache?: { flush(): void };
}

const ImportResponseSchema = z.object({
  imported: z.number(),
  skipped: z.number(),
  errors: z.array(
    z.object({
      row: z.number(),
      message: z.string(),
    })
  ),
});

const ColumnMappingSchema = z.object({
  date: z.number().int().min(0),
  type: z.number().int().min(0),
  ticker: z.number().int().min(0),
  shares: z.number().int().min(0),
  price: z.number().int().min(0),
  amount: z.number().int().min(0),
});

const importRoutes: FastifyPluginAsyncZod<ImportRouteContext> = async (app, opts) => {
  const { dataDir, analyticsCache } = opts;

  app.post(
    '/import/csv',
    {
      preHandler: app.requireAuth,
      schema: {
        body: z.object({
          portfolioId: portfolioIdSchema,
          dryRun: z.boolean().optional().default(false),
          profile: z.enum(['fintual', 'generic']).optional().default('fintual'),
          fileContents: z.string().optional(),
          mapping: ColumnMappingSchema.optional(),
        }),
        response: {
          200: ImportResponseSchema,
        },
      },
    },
    async (request) => {
      const { portfolioId, dryRun, profile, fileContents, mapping } = request.body;

      if (profile === 'generic') {
        if (!fileContents) {
          return {
            imported: 0,
            skipped: 0,
            errors: [{ row: 0, message: 'fileContents is required for generic profile' }],
          };
        }

        const { parseGenericCsvImport, createPortfolioSnapshot } =
          await import('../import/csvPortfolioImport.js');

        const { transactions, errors } = parseGenericCsvImport(fileContents, mapping ?? undefined);

        if (errors.length > 0) {
          return { imported: 0, skipped: 0, errors };
        }

        const snapshot = createPortfolioSnapshot(transactions);

        if (!dryRun) {
          const { writePortfolioState } = await import('../data/portfolioState.js');
          const { runMigrations } = await import('../migrations/index.js');
          const { withLock } = await import('../utils/locks.js');
          const storage = await runMigrations({ dataDir, logger: app.log });
          await withLock(`csv-import:${portfolioId}`, async () => {
            await writePortfolioState(storage, portfolioId, snapshot);
          });
          analyticsCache?.flush();
        }

        return { imported: transactions.length, skipped: 0, errors };
      }

      // Legacy fintual profile
      const { importCsvPortfolio } = await import('../import/csvPortfolioImport.js');
      type ImportFn = (opts: {
        dataDir?: string;
        portfolioId?: string;
        dryRun?: boolean;
      }) => Promise<unknown>;
      const result = (await (importCsvPortfolio as ImportFn)({ dataDir, portfolioId, dryRun })) as {
        transactionCount?: number;
        reconciliation?: { summary?: { totalTransactions?: number } };
      };

      if (!dryRun) {
        analyticsCache?.flush();
      }

      return {
        imported:
          result?.reconciliation?.summary?.totalTransactions ?? result?.transactionCount ?? 0,
        skipped: 0,
        errors: [] as Array<{ row: number; message: string }>,
      };
    }
  );
};

export default importRoutes;

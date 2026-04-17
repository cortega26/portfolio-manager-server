// server/routes/cache.ts
import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { FastifyPluginOptions } from 'fastify';
import { getCacheStats } from '../cache/priceCache.js';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface CacheRouteContext extends FastifyPluginOptions {}

const CacheStatsResponseSchema = z.object({
  keys: z.number(),
  hits: z.number(),
  misses: z.number(),
  hitRate: z.number(),
});

const cacheRoutes: FastifyPluginAsyncZod<CacheRouteContext> = async (app) => {
  app.get(
    '/cache/stats',
    {
      schema: {
        response: {
          200: CacheStatsResponseSchema,
        },
      },
    },
    async () => {
      return getCacheStats();
    },
  );
};

export default cacheRoutes;

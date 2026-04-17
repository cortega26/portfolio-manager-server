// server/routes/monitoring.ts
import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { FastifyPluginOptions } from 'fastify';
import { getPerformanceMetrics } from '../metrics/performanceMetrics.js';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface MonitoringRouteContext extends FastifyPluginOptions {}

const MonitoringResponseSchema = z.object({
  timestamp: z.string(),
  process: z.object({
    pid: z.number(),
    uptimeSeconds: z.number(),
    memory: z.object({
      rss: z.number(),
      heapTotal: z.number(),
      heapUsed: z.number(),
      external: z.number(),
      arrayBuffers: z.number(),
    }),
    loadAverage: z.array(z.number()),
  }),
  cache: z.object({
    keys: z.number(),
    hits: z.number(),
    misses: z.number(),
    hitRate: z.number(),
  }),
  locks: z.record(z.string(), z.unknown()),
});

const monitoringRoutes: FastifyPluginAsyncZod<MonitoringRouteContext> = async (app) => {
  app.get(
    '/monitoring',
    {
      schema: {
        response: {
          200: MonitoringResponseSchema,
        },
      },
    },
    async () => {
      return getPerformanceMetrics() as z.infer<typeof MonitoringResponseSchema>;
    },
  );
};

export default monitoringRoutes;

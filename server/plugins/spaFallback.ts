// server/plugins/spaFallback.ts
import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import type {} from '@fastify/static';

export interface SpaFallbackOptions {
  staticDir: string;
}

const spaFallbackPlugin: FastifyPluginAsync<SpaFallbackOptions> = async (app, opts) => {
  // Serve index.html for all non-API routes (SPA client-side routing)
  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith('/api/')) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Route not found' });
    }
    return reply.sendFile('index.html', opts.staticDir);
  });
};

export default fp(spaFallbackPlugin, { name: 'spaFallback', fastify: '5.x' });

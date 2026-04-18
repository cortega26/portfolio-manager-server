// server/plugins/spaFallback.ts
import fp from 'fastify-plugin';
import path from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
import type {} from '@fastify/static';

export interface SpaFallbackOptions {
  staticDir: string;
}

const spaFallbackPlugin: FastifyPluginAsync<SpaFallbackOptions> = async (app, opts) => {
  // Serve index.html for all non-API routes (SPA client-side routing)
  // Only for routes without a file extension and with a browser-like Accept header
  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith('/api/')) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Route not found' });
    }
    // If the path has a file extension (e.g., /missing.js), don't fall back
    const urlPath = request.url.split('?')[0] ?? '';
    if (path.extname(urlPath) !== '') {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Not found' });
    }
    // Only fall back for HTML or wildcard Accept headers
    const accept = request.headers.accept ?? '';
    if (accept && !accept.includes('text/html') && !accept.includes('*/*')) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Not found' });
    }
    return reply.sendFile('index.html', opts.staticDir);
  });
};

export default fp(spaFallbackPlugin, { name: 'spaFallback', fastify: '5.x' });

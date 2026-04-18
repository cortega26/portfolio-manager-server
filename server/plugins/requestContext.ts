// server/plugins/requestContext.ts
import fp from 'fastify-plugin';
import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';

const requestContextPlugin: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', async (request, reply) => {
    // 1. Attach request ID — pass through inbound X-Request-ID if present, else generate
    const inboundId = request.headers['x-request-id'];
    const requestId =
      typeof inboundId === 'string' && inboundId.trim().length > 0
        ? inboundId.trim().slice(0, 128)
        : randomUUID();
    request.id = requestId;
    reply.header('X-Request-ID', requestId);

    // 2. API versioning: /api/v1/* → /api/* rewrite + version header
    if (request.url.startsWith('/api/v1')) {
      const rewritten = request.url.replace(/^\/api\/v1(?=\/|$)/u, '/api');
      request.raw.url = rewritten.length === 0 ? '/api' : rewritten;
      reply.header('X-API-Version', 'v1');
    } else {
      // Legacy /api path — emit deprecation warning
      reply.header('X-API-Version', 'legacy');
      reply.header(
        'Warning',
        '299 - "Legacy API path /api is deprecated; migrate to /api/v1"',
      );
    }
  });
};

export default fp(requestContextPlugin, {
  name: 'requestContext',
  fastify: '5.x',
});

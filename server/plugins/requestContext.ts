// server/plugins/requestContext.ts
import fp from 'fastify-plugin';
import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';

const requestContextPlugin: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', async (request, reply) => {
    // 1. Attach unique request ID
    const requestId = randomUUID();
    request.id = requestId;
    reply.header('X-Request-Id', requestId);

    // 2. Legacy API rewrite: /v1/api/* → /api/*
    if (request.url.startsWith('/v1/api/')) {
      request.raw.url = request.url.replace('/v1/api/', '/api/');
    }

    // 3. Ensure API version header
    if (!request.headers['x-api-version']) {
      reply.header('X-API-Version', '1');
    }
  });
};

export default fp(requestContextPlugin, {
  name: 'requestContext',
  fastify: '5.x',
});

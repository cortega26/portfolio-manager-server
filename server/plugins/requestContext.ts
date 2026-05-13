import fp from 'fastify-plugin';
import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';

const requestContextPlugin: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', async (request, reply) => {
    // Attach request ID — pass through inbound X-Request-ID if present, else generate
    const inboundId = request.headers['x-request-id'];
    const requestId =
      typeof inboundId === 'string' && inboundId.trim().length > 0
        ? inboundId.trim().slice(0, 128)
        : randomUUID();
    request.id = requestId;
    reply.header('X-Request-ID', requestId);
  });
};

export default fp(requestContextPlugin, {
  name: 'requestContext',
  fastify: '5.x',
});

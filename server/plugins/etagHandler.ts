// server/plugins/etagHandler.ts
import fp from 'fastify-plugin';
import { createHash } from 'node:crypto';
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    sendWithEtag: (
      request: FastifyRequest,
      reply: FastifyReply,
      payload: unknown,
      ttlSeconds?: number,
    ) => Promise<void>;
  }
}

const etagPlugin: FastifyPluginAsync = async (app) => {
  app.decorate(
    'sendWithEtag',
    async (request: FastifyRequest, reply: FastifyReply, payload: unknown, ttlSeconds?: number) => {
      const body = JSON.stringify(payload);
      const etag = `"${createHash('sha256').update(body).digest('hex').slice(0, 16)}"`;

      reply.header('ETag', etag);
      const cacheControl = ttlSeconds != null && ttlSeconds > 0
        ? `private, max-age=${ttlSeconds}`
        : 'private, no-cache';
      reply.header('Cache-Control', cacheControl);

      if (request.headers['if-none-match'] === etag) {
        reply.code(304).send();
        return;
      }

      reply.code(200).send(payload);
    },
  );
};

export default fp(etagPlugin, { name: 'etagHandler', fastify: '5.x' });

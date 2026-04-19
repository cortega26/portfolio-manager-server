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
      // Serialize once — ETag and response body are derived from the same string.
      // Sending the string directly with reply.type('application/json') bypasses
      // Fastify's Zod response serializer, which cannot faithfully round-trip
      // complex nested structures (arrays, z.unknown() values) and produces
      // output that diverges from JSON.stringify — causing "Failed to parse JSON
      // response" on the client.
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

      // Send the pre-serialized string so the body always matches the ETag.
      reply.code(200).type('application/json').send(body);
    },
  );
};

export default fp(etagPlugin, { name: 'etagHandler', fastify: '5.x' });

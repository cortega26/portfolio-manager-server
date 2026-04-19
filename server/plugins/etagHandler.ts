// server/plugins/etagHandler.ts
import fp from 'fastify-plugin';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
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
      // For large bodies, compress synchronously so @fastify/compress's async
      // pump pipeline is bypassed entirely — the async pipe was producing
      // "premature close" errors and delivering an empty body to the client.
      // @fastify/compress skips its onSend hook when Content-Encoding is already set.
      const acceptEncoding = String(request.headers['accept-encoding'] ?? '');
      if (body.length >= 1024 && acceptEncoding.includes('gzip')) {
        const compressed = gzipSync(body);
        reply
          .code(200)
          .type('application/json')
          .header('Content-Encoding', 'gzip')
          .header('Vary', 'Accept-Encoding')
          .send(compressed);
      } else {
        reply.code(200).type('application/json').send(body);
      }
    },
  );
};

export default fp(etagPlugin, { name: 'etagHandler', fastify: '5.x' });

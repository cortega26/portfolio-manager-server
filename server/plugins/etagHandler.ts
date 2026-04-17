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
    ) => Promise<void>;
  }
}

const etagPlugin: FastifyPluginAsync = async (app) => {
  app.decorate(
    'sendWithEtag',
    async (request: FastifyRequest, reply: FastifyReply, payload: unknown) => {
      const body = JSON.stringify(payload);
      const etag = `"${createHash('sha256').update(body).digest('hex').slice(0, 16)}"`;

      reply.header('ETag', etag);
      reply.header('Cache-Control', 'private, no-cache');

      if (request.headers['if-none-match'] === etag) {
        reply.code(304).send();
        return;
      }

      reply.code(200).type('application/json').send(body);
    },
  );
};

export default fp(etagPlugin, { name: 'etagHandler', fastify: '5.x' });

// server/plugins/sessionAuth.ts
// CRITICAL: timingSafeEqual is used to prevent timing attacks on session token comparison.
// Both sides are hashed with SHA256 first, ensuring equal buffer lengths regardless of token length.
import fp from 'fastify-plugin';
import { timingSafeEqual, createHash } from 'node:crypto';
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export interface SessionAuthOptions {
  sessionToken: string;
  headerName: string;
  devBypass?: boolean;
  logger: { warn: (msg: string, meta?: Record<string, unknown>) => void };
}

const sessionAuthPlugin: FastifyPluginAsync<SessionAuthOptions> = async (app, opts) => {
  app.decorate('requireAuth', async (request: FastifyRequest, reply: FastifyReply) => {
    // Development bypass — logs warning, never silently skips
    if (opts.devBypass) {
      opts.logger.warn('SESSION AUTH BYPASS ACTIVE — development only');
      return;
    }

    const incoming = request.headers[opts.headerName.toLowerCase()];

    if (!incoming || typeof incoming !== 'string') {
      // Match Express error code for missing token
      return reply.code(401).send({ error: 'NO_SESSION_TOKEN', message: 'Session token required.' });
    }

    // Hash both sides with SHA256 to ensure equal-length buffers for timingSafeEqual.
    // This prevents length-based timing side-channels.
    const expectedBuf = Buffer.from(
      createHash('sha256').update(opts.sessionToken).digest('hex'),
    );
    const incomingBuf = Buffer.from(
      createHash('sha256').update(incoming).digest('hex'),
    );

    if (expectedBuf.length !== incomingBuf.length || !timingSafeEqual(expectedBuf, incomingBuf)) {
      // Match Express error code and status for invalid token
      return reply.code(403).send({ error: 'INVALID_SESSION_TOKEN', message: 'Invalid session token.' });
    }
  });
};

export default fp(sessionAuthPlugin, {
  name: 'sessionAuth',
  fastify: '5.x',
});

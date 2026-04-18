import {
  createSessionTestApp as _createSessionTestApp,
  withSession,
  request,
  TEST_SESSION_TOKEN,
  TEST_SESSION_HEADER,
  closeApp,
} from './helpers/fastifyTestApp.js';

export { TEST_SESSION_TOKEN, TEST_SESSION_HEADER, withSession, request, closeApp };

/**
 * Async drop-in for the old synchronous createSessionTestApp.
 * Returns a ready FastifyInstance (not an Express app).
 */
export async function createSessionTestApp(opts = {}) {
  return _createSessionTestApp(opts);
}

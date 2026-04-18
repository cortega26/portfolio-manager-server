import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { afterEach, beforeEach, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

import pino from 'pino';

import { createSessionTestApp, withSession, closeApp, request } from './helpers/fastifyTestApp.js';

let dataDir;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'http-logging-tests-'));
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

test('HTTP logs redact API key and session token headers', async () => {
  const captured = [];
  // In Fastify, pass a custom pino logger instance that writes to our stream
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      captured.push(chunk.toString());
      callback();
    },
  });
  const captureLogger = pino(
    {
      level: 'info',
      redact: ['req.headers["x-session-token"]', 'req.headers["x-api-key"]'],
    },
    stream,
  );

  const app = await createSessionTestApp({
    dataDir,
    logger: captureLogger,
  });

  const response = await withSession(
    request(app)
      .get('/api/returns/daily'),
    'DesktopSecret789!',
  );
  await closeApp(app);

  assert.equal(response.status, 200);

  const logLine = captured.find((line) => line.includes('"msg":"request_complete"'));
  assert.ok(logLine, 'expected request_complete log line');
  const parsed = JSON.parse(logLine);
  assert.equal(parsed.req.headers['x-session-token'], '[REDACTED]');
});

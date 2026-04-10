import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { afterEach, beforeEach, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

import pino from 'pino';
import pinoHttp from 'pino-http';
import request from 'supertest';

import { createSessionTestApp, withSession } from './sessionTestUtils.js';

const noopLogger = {
  info() {},
  warn() {},
  error() {},
  child() {
    return this;
  },
};

let dataDir;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'http-logging-tests-'));
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

test('HTTP logs redact API key and session token headers', async () => {
  const captured = [];
  const httpLoggerFactory = (options) => {
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        captured.push(chunk.toString());
        callback();
      },
    });
    const logger = pino(
      {
        level: 'info',
        redact: options.redact,
      },
      stream,
    );
    return pinoHttp({ ...options, logger });
  };

  const app = createSessionTestApp({
    dataDir,
    logger: noopLogger,
    httpLoggerFactory,
  });

  const response = await withSession(
    request(app)
      .get('/api/returns/daily'),
    'DesktopSecret789!',
  );

  assert.equal(response.status, 200);

  const logLine = captured.find((line) => line.includes('"msg":"request_complete"'));
  assert.ok(logLine, 'expected request_complete log line');
  const parsed = JSON.parse(logLine);
  assert.equal(parsed.req.headers['x-session-token'], '[REDACTED]');
});

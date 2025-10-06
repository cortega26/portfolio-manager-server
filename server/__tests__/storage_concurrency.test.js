import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { promises as fsPromises } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import request from 'supertest';

import { createApp } from '../app.js';
import { JsonTableStorage } from '../data/storage.js';
import { atomicWriteFile } from '../utils/atomicStore.js';
import { portfolioBodySchema } from '../middleware/validation.js';

const noopLogger = {
  info() {},
  warn() {},
  error() {},
};

let dataDir;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'portfolio-storage-'));
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

test('JsonTableStorage serializes Promise.all writes without corrupting the table', async () => {
  const storage = new JsonTableStorage({ dataDir, logger: noopLogger });
  const tableName = 'portfolio_serialized';
  const payloads = Array.from({ length: 24 }, (_, index) => [
    {
      id: `row-${index}-a`,
      amount: index * 2,
      tag: `writer-${index}`,
    },
    {
      id: `row-${index}-b`,
      amount: index * 3,
      tag: `writer-${index}`,
    },
  ]);

  await Promise.all(payloads.map((rows) => storage.writeTable(tableName, rows)));

  const filePath = path.join(dataDir, `${tableName}.json`);
  const raw = readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);

  const matches = payloads.some((rows) => {
    try {
      assert.deepEqual(parsed, rows);
      return true;
    } catch {
      return false;
    }
  });

  assert.equal(matches, true, 'final table should match one of the serialized writers');
  assert.match(raw.trim(), /^\[/u, 'serialized file should remain valid JSON array');
});

test('API writes remain atomic and JSON-parseable under Promise.all load', async () => {
  const app = createApp({ dataDir, logger: noopLogger });
  const portfolioId = 'stress';
  const payloads = Array.from({ length: 16 }, (_, index) => ({
    transactions: [
      {
        uid: `tx-${index}`,
        date: `2024-04-${String((index % 27) + 1).padStart(2, '0')}`,
        type: 'DEPOSIT',
        amount: 1_000 + index,
      },
    ],
    signals: { [`SYM${index}`]: { pct: (index % 5) * 5 } },
    settings: { autoClip: index % 2 === 0 },
  }));

  const normalizedPayloads = payloads.map((payload) =>
    JSON.parse(JSON.stringify(portfolioBodySchema.parse(payload))),
  );

  const responses = await Promise.all(
    payloads.map((payload) =>
      request(app)
        .post(`/api/portfolio/${portfolioId}`)
        .set('X-Portfolio-Key', 'ValidKeyStress1!')
        .send(payload),
    ),
  );

  for (const response of responses) {
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { status: 'ok' });
  }

  const filePath = path.join(dataDir, 'portfolio_stress.json');
  const raw = readFileSync(filePath, 'utf8');
  const saved = JSON.parse(raw);

  const sanitized = {
    ...saved,
    transactions: (saved.transactions ?? []).map((transaction) => {
      const { createdAt, seq, ...rest } = transaction;
      return rest;
    }),
  };

  const matches = normalizedPayloads.some((expected) => {
    try {
      assert.deepEqual(sanitized, expected);
      return true;
    } catch {
      return false;
    }
  });

  assert.equal(matches, true, 'final portfolio JSON should match one submitted payload');
  assert.ok(Array.isArray(saved.transactions));
  assert.equal(typeof saved.settings?.autoClip, 'boolean');
});

test('atomicWriteFile preserves previous content when rename fails mid-write', async () => {
  const filePath = path.join(dataDir, 'portfolio_atomic.json');
  writeFileSync(filePath, `${JSON.stringify({ transactions: [{ id: 'baseline' }] }, null, 2)}\n`);

  const renameMock = mock.method(fsPromises, 'rename', async () => {
    throw new Error('simulated crash during rename');
  });

  try {
    await assert.rejects(
      async () => {
        await atomicWriteFile(
          filePath,
          `${JSON.stringify({ transactions: [{ id: 'new' }] }, null, 2)}\n`,
        );
      },
      /simulated crash/,
    );
  } finally {
    renameMock.mock.restore();
  }

  const raw = readFileSync(filePath, 'utf8');
  const persisted = JSON.parse(raw);
  assert.deepEqual(persisted, { transactions: [{ id: 'baseline' }] });
});

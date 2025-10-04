import assert from 'node:assert/strict';
import { test } from 'node:test';

import { YahooPriceProvider } from '../data/prices.js';

const csv = `Date,Open,High,Low,Close,Adj Close,Volume\n2024-01-01,1,1,1,10,9.5,100`;

test('YahooPriceProvider parses adjusted close values', async () => {
  const fetchImpl = async () => ({ ok: true, text: async () => csv });
  const provider = new YahooPriceProvider({ fetchImpl, timeoutMs: 1000 });
  const rows = await provider.getDailyAdjustedClose('SPY', '2024-01-01', '2024-01-02');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].adjClose, 9.5);
});

test('YahooPriceProvider surfaces upstream failures', async () => {
  let logged = false;
  const fetchImpl = async () => ({ ok: false, text: async () => '' });
  const logger = { error: () => { logged = true; } };
  const provider = new YahooPriceProvider({ fetchImpl, timeoutMs: 1000, logger });
  await assert.rejects(() =>
    provider.getDailyAdjustedClose('SPY', '2024-01-01', '2024-01-02'),
  );
  assert.equal(logged, true);
});

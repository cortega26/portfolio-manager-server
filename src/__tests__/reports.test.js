import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildPerformanceCsv, buildSecurityEventsCsv } from '../utils/reports.js';

test('buildPerformanceCsv includes benchmark series columns in the header and rows', () => {
  const csv = buildPerformanceCsv([
    {
      date: '2024-01-02',
      portfolio: 0.01234,
      spy: 0.01001,
      blended: 0.0095,
      exCash: 0.01111,
      cash: 0.0005,
    },
  ]);

  const lines = csv.trim().split('\n');
  assert.equal(
    lines[0],
    'date,portfolio_roi,spy_roi,blended_roi,ex_cash_roi,cash_roi,spy_spread',
  );
  assert.equal(
    lines[1],
    '2024-01-02,0.012%,0.010%,0.009%,0.011%,0.001%,0.002%',
  );
});

test('buildSecurityEventsCsv serialises security events with request metadata', () => {
  const csv = buildSecurityEventsCsv([
    {
      timestamp: '2024-01-05T12:00:00Z',
      event: 'auth_failed',
      portfolio_id: 'demo',
      ip: '127.0.0.1',
      user_agent: 'vitest',
      request_id: 'req-1',
      attempts: 3,
    },
  ]);

  const lines = csv.trim().split('\n');
  assert.equal(
    lines[0],
    'timestamp,event,portfolio_id,ip,user_agent,request_id,metadata',
  );
  assert.equal(
    lines[1],
    '2024-01-05T12:00:00Z,auth_failed,demo,127.0.0.1,vitest,req-1,"{""attempts"":3}"',
  );
});

/**
 * Unit tests for StooqPriceProvider hardening:
 *  - User-Agent header sent on every request
 *  - Multi-row CSV parsed correctly
 *  - "No data" CSV throws PRICE_NOT_FOUND
 *  - HTML response via Content-Type throws PRICE_FETCH_FAILED
 *  - HTML response via body first-line throws PRICE_FETCH_FAILED
 *  - Rows outside the requested date window are filtered out
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { StooqPriceProvider } from '../../server/data/prices.js';

const MULTI_ROW_CSV = [
  'Date,Open,High,Low,Close,Volume',
  '2024-01-02,200,210,195,205,1000',
  '2024-01-03,205,215,200,210,1200',
  '2024-01-04,210,220,205,215,1500',
].join('\n');

test('StooqPriceProvider sends a User-Agent header on every request', async () => {
  const capturedOptions = [];
  const fetchImpl = async (_url, options = {}) => {
    capturedOptions.push(options);
    return {
      ok: true,
      headers: { get: () => null },
      text: async () => MULTI_ROW_CSV,
    };
  };
  const provider = new StooqPriceProvider({ fetchImpl, timeoutMs: 1000 });
  await provider.getDailyAdjustedClose('AAPL', '2024-01-01', '2024-01-05');

  assert.equal(capturedOptions.length, 1, 'fetch called once');
  const ua = capturedOptions[0].headers?.['User-Agent'];
  assert.ok(typeof ua === 'string' && ua.length > 10, `User-Agent is set: ${ua}`);
});

test('StooqPriceProvider parses multi-row CSV and sorts by date', async () => {
  // Feed rows in reverse order to verify sort
  const reversedCsv = [
    'Date,Open,High,Low,Close,Volume',
    '2024-01-04,210,220,205,215,1500',
    '2024-01-02,200,210,195,205,1000',
    '2024-01-03,205,215,200,210,1200',
  ].join('\n');
  const fetchImpl = async () => ({
    ok: true,
    headers: { get: () => null },
    text: async () => reversedCsv,
  });
  const provider = new StooqPriceProvider({ fetchImpl, timeoutMs: 1000 });
  const rows = await provider.getDailyAdjustedClose('AAPL', '2024-01-01', '2024-01-05');

  assert.equal(rows.length, 3);
  assert.equal(rows[0].date, '2024-01-02');
  assert.equal(rows[1].date, '2024-01-03');
  assert.equal(rows[2].date, '2024-01-04');
  assert.equal(rows[0].adjClose, 205);
  assert.equal(rows[2].adjClose, 215);
});

test('StooqPriceProvider throws PRICE_NOT_FOUND for "No data" CSV body', async () => {
  const fetchImpl = async () => ({
    ok: true,
    headers: { get: () => null },
    text: async () => 'No data',
  });
  const provider = new StooqPriceProvider({ fetchImpl, timeoutMs: 1000 });
  await assert.rejects(
    () => provider.getDailyAdjustedClose('XYZ', '2024-01-01', '2024-01-05'),
    (error) => {
      assert.equal(error.code, 'PRICE_NOT_FOUND');
      assert.equal(error.status, 404);
      return true;
    }
  );
});

test('StooqPriceProvider throws PRICE_FETCH_FAILED when Content-Type is text/html', async () => {
  const fetchImpl = async () => ({
    ok: true,
    headers: { get: (name) => (name === 'content-type' ? 'text/html; charset=utf-8' : null) },
    text: async () => '<!DOCTYPE html><html><body>Captcha</body></html>',
  });
  const provider = new StooqPriceProvider({ fetchImpl, timeoutMs: 1000 });
  await assert.rejects(
    () => provider.getDailyAdjustedClose('SPY', '2024-01-01', '2024-01-05'),
    (error) => {
      assert.equal(error.code, 'PRICE_FETCH_FAILED');
      assert.match(error.message, /HTML/);
      return true;
    }
  );
});

test('StooqPriceProvider throws PRICE_FETCH_FAILED when body starts with < (HTML body, no content-type)', async () => {
  const fetchImpl = async () => ({
    ok: true,
    // Content-Type is not html but body still contains HTML
    headers: { get: () => null },
    text: async () => '<!DOCTYPE html>\n<html><body>Rate limited</body></html>',
  });
  const provider = new StooqPriceProvider({ fetchImpl, timeoutMs: 1000 });
  await assert.rejects(
    () => provider.getDailyAdjustedClose('SPY', '2024-01-01', '2024-01-05'),
    (error) => {
      assert.equal(error.code, 'PRICE_FETCH_FAILED');
      return true;
    }
  );
});

test('StooqPriceProvider filters out rows outside the requested date window', async () => {
  // The CSV contains dates before and after the requested range
  const csv = [
    'Date,Open,High,Low,Close,Volume',
    '2024-01-01,100,110,90,105,500', // before window
    '2024-01-02,200,210,195,205,1000', // in window
    '2024-01-03,205,215,200,210,1200', // in window
    '2024-01-10,300,310,290,305,2000', // after window
  ].join('\n');
  const fetchImpl = async () => ({
    ok: true,
    headers: { get: () => null },
    text: async () => csv,
  });
  const provider = new StooqPriceProvider({ fetchImpl, timeoutMs: 1000 });
  const rows = await provider.getDailyAdjustedClose('AAPL', '2024-01-02', '2024-01-05');

  assert.equal(rows.length, 2, `Expected 2 rows, got ${rows.length}`);
  assert.equal(rows[0].date, '2024-01-02');
  assert.equal(rows[1].date, '2024-01-03');
});

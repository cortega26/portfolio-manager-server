import { describe, test, expect, vi } from 'vitest';
import { normalizeTickerSymbol } from '../utils/portfolioManagerApp.js';
import { fetchBulkPrices } from '../utils/api.js';

// Mock requestJson from api.js so we can inspect what symbols are requested
vi.mock('../lib/apiClient.js', () => ({
  requestJson: vi.fn(async (_path) => {
    return { data: { series: {} }, requestId: 'mock-id', version: 'v1' };
  }),
  getRuntimeConfigSync: () => ({}),
  loadRuntimeConfig: async () => ({}),
  getApiBaseUrlSync: () => 'http://localhost:3000',
  resolveApiBaseUrl: async () => 'http://localhost:3000',
}));

describe('Ticker Normalization & Filtering', () => {
  test('normalizeTickerSymbol trims and converts to uppercase', () => {
    expect(normalizeTickerSymbol('  aapl  ')).toBe('AAPL');
    expect(normalizeTickerSymbol('msft')).toBe('MSFT');
  });

  test('normalizeTickerSymbol returns empty string for null, undefined, non-string, UNDEFINED and CASH', () => {
    expect(normalizeTickerSymbol(null)).toBe('');
    expect(normalizeTickerSymbol(undefined)).toBe('');
    expect(normalizeTickerSymbol(123 as unknown as string)).toBe('');
    expect(normalizeTickerSymbol('undefined')).toBe('');
    expect(normalizeTickerSymbol('UNDEFINED')).toBe('');
    expect(normalizeTickerSymbol('cash')).toBe('');
    expect(normalizeTickerSymbol('CASH')).toBe('');
  });

  test('fetchBulkPrices filters out UNDEFINED and CASH from symbols list before request', async () => {
    const { requestJson } = await import('../lib/apiClient.js');

    await fetchBulkPrices(['AAPL', 'undefined', 'MSFT', 'CASH', null as unknown as string, 'TSLA']);

    // Check what path was called
    const lastCall = vi.mocked(requestJson).mock.calls.at(-1);
    expect(lastCall).toBeDefined();
    const requestedPath = lastCall![0];

    // The query string should contain AAPL, MSFT, TSLA, but NOT undefined or CASH
    expect(requestedPath).toContain('AAPL');
    expect(requestedPath).toContain('MSFT');
    expect(requestedPath).toContain('TSLA');
    expect(requestedPath).not.toContain('UNDEFINED');
    expect(requestedPath).not.toContain('undefined');
    expect(requestedPath).not.toContain('CASH');
    expect(requestedPath).not.toContain('cash');
  });
});

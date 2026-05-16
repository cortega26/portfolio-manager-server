import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveSector,
  mapHoldingsToSectors,
  getSectorColor,
  normalizeTicker,
  GICS_SECTORS,
  DEFAULT_FALLBACK_SECTOR,
} from '../sectors.js';

describe('shared/sectors', () => {
  describe('normalizeTicker', () => {
    it('uppercases and trims', () => {
      assert.equal(normalizeTicker('  aapl  '), 'AAPL');
    });

    it('returns empty string for non-string input', () => {
      assert.equal(normalizeTicker(null), '');
      assert.equal(normalizeTicker(undefined), '');
      assert.equal(normalizeTicker(123), '');
    });

    it('returns empty string for empty input', () => {
      assert.equal(normalizeTicker(''), '');
      assert.equal(normalizeTicker('   '), '');
    });
  });

  describe('resolveSector', () => {
    it('resolves known technology tickers', () => {
      assert.equal(resolveSector('AAPL'), GICS_SECTORS.TECHNOLOGY);
      assert.equal(resolveSector('MSFT'), GICS_SECTORS.TECHNOLOGY);
      assert.equal(resolveSector('NVDA'), GICS_SECTORS.TECHNOLOGY);
    });

    it('resolves known financial tickers', () => {
      assert.equal(resolveSector('JPM'), GICS_SECTORS.FINANCIALS);
      assert.equal(resolveSector('V'), GICS_SECTORS.FINANCIALS);
    });

    it('resolves healthcare tickers', () => {
      assert.equal(resolveSector('JNJ'), GICS_SECTORS.HEALTHCARE);
      assert.equal(resolveSector('PFE'), GICS_SECTORS.HEALTHCARE);
    });

    it('resolves ETFs as ETF sector', () => {
      assert.equal(resolveSector('SPY'), 'ETF');
      assert.equal(resolveSector('QQQ'), 'ETF');
    });

    it('returns fallback for unknown tickers', () => {
      assert.equal(resolveSector('ZZZZ'), DEFAULT_FALLBACK_SECTOR);
    });

    it('accepts custom fallback', () => {
      assert.equal(resolveSector('ZZZZ', 'Unknown'), 'Unknown');
    });

    it('handles lowercase input', () => {
      assert.equal(resolveSector('aapl'), GICS_SECTORS.TECHNOLOGY);
    });
  });

  describe('getSectorColor', () => {
    it('returns colors for known sectors', () => {
      const color = getSectorColor(GICS_SECTORS.TECHNOLOGY);
      assert.equal(typeof color, 'string');
      assert.ok(color.startsWith('#'));
    });

    it('returns OTHER color for unknown sector', () => {
      assert.equal(getSectorColor('Bogus'), getSectorColor('OTHER'));
    });
  });

  describe('mapHoldingsToSectors', () => {
    const holdings = [
      { ticker: 'AAPL', shares: '10' },
      { ticker: 'MSFT', shares: '5' },
      { ticker: 'JPM', shares: '20' },
      { ticker: 'SPY', shares: '2' },
      { ticker: 'ZZZZ', shares: '100' }, // unknown ticker
    ];
    const prices = {
      AAPL: 200,
      MSFT: 400,
      JPM: 150,
      SPY: 500,
      ZZZZ: 50,
    };

    it('groups holdings by sector', () => {
      const result = mapHoldingsToSectors(holdings, prices);
      assert.ok(Array.isArray(result));
      assert.ok(result.length >= 4); // Technology, Financials, ETF, Other

      const tech = result.find((r) => r.sector === GICS_SECTORS.TECHNOLOGY);
      assert.ok(tech);
      assert.equal(tech.value, 10 * 200 + 5 * 400); // 4000
    });

    it('returns empty array for empty holdings', () => {
      assert.deepEqual(mapHoldingsToSectors([], {}), []);
    });

    it('returns empty array for non-array input', () => {
      assert.deepEqual(mapHoldingsToSectors(null, {}), []);
    });

    it('skips holdings with missing or zero prices', () => {
      const result = mapHoldingsToSectors([{ ticker: 'AAPL', shares: '10' }], { AAPL: 0 });
      assert.deepEqual(result, []);
    });

    it('skips holdings with invalid shares', () => {
      const result = mapHoldingsToSectors([{ ticker: 'AAPL', shares: '0' }], { AAPL: 200 });
      assert.deepEqual(result, []);
    });

    it('sorts sectors by value descending', () => {
      const result = mapHoldingsToSectors(
        [
          { ticker: 'AAPL', shares: '10' }, // 2000
          { ticker: 'JPM', shares: '20' }, // 3000
        ],
        { AAPL: 200, JPM: 150 }
      );
      assert.equal(result[0].sector, GICS_SECTORS.FINANCIALS);
      assert.equal(result[1].sector, GICS_SECTORS.TECHNOLOGY);
    });

    it('includes ticker list per sector', () => {
      const result = mapHoldingsToSectors([{ ticker: 'AAPL', shares: '10' }], { AAPL: 200 });
      assert.ok(result[0].tickers.includes('AAPL'));
    });
  });
});

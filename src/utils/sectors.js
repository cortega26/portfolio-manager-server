// src/utils/sectors.js
// Frontend sector allocation utility.
// Pure function — useMemo-friendly signature.

import { mapHoldingsToSectors, getSectorColor } from '../../shared/sectors.js';

/**
 * Computes sector allocation slices from open holdings + current prices.
 *
 * @param {Array} openHoldings - array of holding objects with .ticker, .shares
 * @param {Object} currentPrices - map of ticker → price (number)
 * @param {number} cashBalance - current cash balance
 * @returns {{ slices: Array<{sector: string, value: number, percentage: number, tickers: string[], color: string}>, totalNav: number }}
 */
export function computeSectorAllocationSlices(openHoldings, currentPrices, cashBalance) {
  const cash = Number.isFinite(Number(cashBalance)) ? Number(cashBalance) : 0;

  const sectorEntries = mapHoldingsToSectors(openHoldings, currentPrices);

  const totalEquity = sectorEntries.reduce((sum, s) => sum + s.value, 0);
  const totalNav = totalEquity + Math.max(0, cash);

  if (totalNav <= 0) {
    return { slices: [], totalNav: 0 };
  }

  const slices = sectorEntries.map((entry) => ({
    sector: entry.sector,
    value: entry.value,
    percentage: (entry.value / totalNav) * 100,
    tickers: entry.tickers,
    color: getSectorColor(entry.sector),
  }));

  if (cash > 0) {
    slices.push({
      sector: 'Cash',
      value: cash,
      percentage: (cash / totalNav) * 100,
      tickers: [],
      color: getSectorColor('OTHER'),
    });
  }

  return { slices, totalNav };
}

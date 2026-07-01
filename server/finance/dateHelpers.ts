// server/finance/dateHelpers.ts

/**
 * Numeric 4-digit year from an ISO date string; `0` when unparseable.
 * Preserves the previous `dividends.ts` behavior exactly.
 */
export function yearNumberFromDate(date: string): number {
  return Number.parseInt(date.slice(0, 4), 10) || 0;
}

/**
 * 4-character year label from an ISO date string; `'Unknown'` when the string
 * is too short. Preserves the previous `tradeStats.ts` behavior exactly.
 */
export function yearLabelFromDate(date: string): string {
  if (date.length >= 4) return date.slice(0, 4);
  return 'Unknown';
}

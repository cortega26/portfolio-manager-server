// server/finance/lotMatcher.ts
// FIFO lot matcher: consumes a sorted transaction array and emits ClosedLot records.
// All arithmetic uses Decimal.js — no native JS +/-/*/÷ on monetary or share values.

import { d } from './decimal.js';
import type { Decimal } from 'decimal.js';

// ── Public types ──────────────────────────────────────────────────────────────

/** Minimal transaction shape consumed by the lot matcher. */
export interface LotTransaction {
  /** ISO date YYYY-MM-DD */
  date: string;
  /** Must be 'BUY' or 'SELL' for lot matching. Other types are ignored. */
  type: string;
  /** Ticker symbol (ignored for non-equity types). */
  ticker?: string;
  /** Shares traded (positive number or string). */
  shares?: number | string | null;
  /** Price per share (positive number or string). */
  price?: number | string | null;
  /** Optional stable uid for diagnostics. */
  uid?: string;
}

/** One lot opened by a BUY that has not yet been fully matched. */
export interface OpenLot {
  ticker: string;
  buyDate: string;
  buyPrice: string;   // Decimal serialised as string
  shares: string;     // remaining unmatched shares, Decimal serialised as string
  uid?: string;
}

/** A fully or partially consumed lot: one unit of realized income/loss. */
export interface ClosedLot {
  ticker: string;
  buyDate: string;
  sellDate: string;
  buyPrice: string;    // per share, Decimal serialised as string
  sellPrice: string;   // per share, Decimal serialised as string
  shares: string;      // shares consumed in this match
  costBasis: string;   // shares × buyPrice
  proceeds: string;    // shares × sellPrice
  gainLoss: string;    // proceeds − costBasis
  holdingDays: number;
}

export interface LotMatchResult {
  closedLots: ClosedLot[];
  openLots: OpenLot[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysBetween(from: string, to: string): number {
  const msPerDay = 86_400_000;
  return Math.round((Date.parse(to) - Date.parse(from)) / msPerDay);
}

function serializeDecimal(dec: Decimal): string {
  return dec.toFixed(10).replace(/\.?0+$/, '') || '0';
}

// ── Core algorithm ────────────────────────────────────────────────────────────

/**
 * Match a sorted array of transactions using FIFO lot accounting.
 *
 * Rules:
 * - BUY  → push a new open lot onto the per-ticker FIFO queue.
 * - SELL → dequeue lots from the front of the queue (FIFO) until `shares sold`
 *          is exhausted.  Partial lots are split.
 * - Other transaction types (DIVIDEND, DEPOSIT, …) are ignored.
 * - If a SELL exceeds the available shares for a ticker, an error is thrown
 *   (the app's enforceOversellPolicy prevents this in normal operation, but the
 *   matcher must never silently produce negative share counts).
 *
 * @param transactions Array of transactions sorted ascending by date.
 * @returns `{ closedLots, openLots }` — all values serialised as strings.
 */
export function matchLots(transactions: LotTransaction[]): LotMatchResult {
  // Per-ticker queue of open lots (front = oldest = consumed first under FIFO).
  const queues = new Map<string, Array<{ buyDate: string; buyPrice: Decimal; shares: Decimal; uid?: string }>>();

  const closedLots: ClosedLot[] = [];

  for (const tx of transactions) {
    const type = tx.type?.toUpperCase();
    if (type !== 'BUY' && type !== 'SELL') {
      continue;
    }
    if (!tx.ticker || tx.ticker === 'CASH') {
      continue;
    }

    const ticker = tx.ticker.toUpperCase();
    const txShares = d(tx.shares ?? 0);
    const txPrice = d(tx.price ?? 0);

    if (txShares.lte(0)) {
      continue; // zero/negative share transactions are noops
    }

    if (type === 'BUY') {
      if (!queues.has(ticker)) {
        queues.set(ticker, []);
      }
      queues.get(ticker)!.push({
        buyDate: tx.date,
        buyPrice: txPrice,
        shares: txShares,
        uid: tx.uid,
      });
    } else {
      // SELL
      const queue = queues.get(ticker) ?? [];
      let remaining = txShares;

      while (remaining.gt(0)) {
        if (queue.length === 0) {
          throw new Error(
            `LotMatcher: SELL of ${remaining.toFixed()} shares of ${ticker} on ${tx.date} exceeds available open lots.`,
          );
        }

        const lot = queue[0]!;

        if (lot.shares.lte(remaining)) {
          // Consume the whole lot.
          const consumedShares = lot.shares;
          const costBasis = consumedShares.times(lot.buyPrice);
          const proceeds = consumedShares.times(txPrice);
          const gainLoss = proceeds.minus(costBasis);
          closedLots.push({
            ticker,
            buyDate: lot.buyDate,
            sellDate: tx.date,
            buyPrice: serializeDecimal(lot.buyPrice),
            sellPrice: serializeDecimal(txPrice),
            shares: serializeDecimal(consumedShares),
            costBasis: serializeDecimal(costBasis),
            proceeds: serializeDecimal(proceeds),
            gainLoss: serializeDecimal(gainLoss),
            holdingDays: daysBetween(lot.buyDate, tx.date),
          });
          remaining = remaining.minus(consumedShares);
          queue.shift();
        } else {
          // Consume a partial lot (split).
          const consumedShares = remaining;
          const costBasis = consumedShares.times(lot.buyPrice);
          const proceeds = consumedShares.times(txPrice);
          const gainLoss = proceeds.minus(costBasis);
          closedLots.push({
            ticker,
            buyDate: lot.buyDate,
            sellDate: tx.date,
            buyPrice: serializeDecimal(lot.buyPrice),
            sellPrice: serializeDecimal(txPrice),
            shares: serializeDecimal(consumedShares),
            costBasis: serializeDecimal(costBasis),
            proceeds: serializeDecimal(proceeds),
            gainLoss: serializeDecimal(gainLoss),
            holdingDays: daysBetween(lot.buyDate, tx.date),
          });
          lot.shares = lot.shares.minus(consumedShares);
          remaining = d(0);
        }
      }

      if (queue.length === 0) {
        queues.delete(ticker);
      }
    }
  }

  // Serialize open lots.
  const openLots: OpenLot[] = [];
  for (const [ticker, queue] of queues.entries()) {
    for (const lot of queue) {
      openLots.push({
        ticker,
        buyDate: lot.buyDate,
        buyPrice: serializeDecimal(lot.buyPrice),
        shares: serializeDecimal(lot.shares),
        uid: lot.uid,
      });
    }
  }

  return { closedLots, openLots };
}

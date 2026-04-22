// server/finance/inboxComputer.ts
// Computes the Action Inbox feed for a portfolio (Phase 5).
//
// Rules:
// - THRESHOLD_TRIGGERED: reuses signal evaluation from signalNotifications.js
// - LARGE_MOVE_UNREVIEWED: position ±20% from reference price (last dismiss or avg cost)
// - LONG_UNREVIEWED: no review in 30+ trading days + position ≥ $500
// - NO_THRESHOLD_CONFIGURED: position ≥ $500 with no signal configured
//
// Output: InboxItem[] sorted by urgency (HIGH → MEDIUM → LOW),
//         filtered for non-dismissed events.

import { d, roundDecimal } from './decimal.js';
import { computeTradingDayAge } from '../utils/calendar.js';
import { buildPortfolioSignalRows } from '../services/signalNotifications.js';
import { isSignalStatusActionable, isOpenSignalHolding, resolveSignalWindow } from '../../shared/signals.js';
import { sortTransactions, projectStateUntil } from './portfolio.js';
import type { InboxItem, InboxEventType, InboxReviewRecord } from '../types/inbox.js';
import { URGENCY_ORDER } from '../types/inbox.js';

export type { InboxItem };

// Minimum position value ($USD) to surface LONG_UNREVIEWED / NO_THRESHOLD_CONFIGURED.
const MIN_POSITION_VALUE_USD = 500;
// Minimum trading days without review to surface LONG_UNREVIEWED.
const LONG_UNREVIEWED_DAYS = 30;
// Minimum percent move to surface LARGE_MOVE_UNREVIEWED.
const LARGE_MOVE_PCT = 20;

interface Transaction {
  date?: string;
  type?: string;
  ticker?: string;
  shares?: number;
  quantity?: number;
  price?: number;
  amount?: number;
  [key: string]: unknown;
}

export interface InboxComputerInput {
  /** All portfolio transactions (raw, unsorted). */
  transactions: Transaction[];
  /** Signal configuration object, keyed by ticker. */
  signals: Record<string, unknown>;
  /**
   * Latest prices keyed by ticker.
   * Each value has { price: number | null, asOf: string | null }.
   */
  priceSnapshots: Map<string, { price: number | null; asOf: string | null }>;
  /** All dismiss records for this portfolio from inbox_reviews table. */
  dismissHistory: InboxReviewRecord[];
  /** Reference date used for staleness calculations. Defaults to now. */
  referenceDate?: Date;
}

// ── Event key builders ────────────────────────────────────────────────────────

export function buildThresholdEventKey(
  ticker: string,
  signalStatus: string,
  thresholdPct: number,
  priceAsOf: string | null,
): string {
  const direction = signalStatus === 'BUY_ZONE' ? 'below' : 'above';
  const dateTag = priceAsOf ?? 'unknown';
  return `${ticker}:${direction}:${thresholdPct}:${dateTag}`;
}

export function buildLargeMoveEventKey(
  ticker: string,
  movePct: number,
  periodStartDate: string | null,
): string {
  const sign = movePct >= 0 ? 'up' : 'down';
  const absPct = Math.round(Math.abs(movePct));
  const dateTag = periodStartDate ?? 'unknown';
  return `${ticker}:${sign}:${absPct}:${dateTag}`;
}

export function buildLongUnreviewedEventKey(
  ticker: string,
  periodDate: string,
): string {
  return `${ticker}:LONG_UNREVIEWED:${periodDate}`;
}

export function buildNoThresholdEventKey(
  ticker: string,
  periodDate: string,
): string {
  return `${ticker}:NO_THRESHOLD_CONFIGURED:${periodDate}`;
}

// ── Dismiss helpers ───────────────────────────────────────────────────────────

function isDismissed(
  ticker: string,
  eventType: InboxEventType,
  eventKey: string,
  dismissHistory: InboxReviewRecord[],
): boolean {
  return dismissHistory.some(
    (r) =>
      r.ticker === ticker &&
      r.event_type === eventType &&
      r.event_key === eventKey,
  );
}

/** Returns the most recent dismiss record for a given (ticker, eventType) pair. */
function latestDismiss(
  ticker: string,
  eventType: InboxEventType,
  dismissHistory: InboxReviewRecord[],
): InboxReviewRecord | null {
  const matching = dismissHistory.filter(
    (r) => r.ticker === ticker && r.event_type === eventType,
  );
  if (matching.length === 0) return null;
  return matching.reduce((prev, cur) =>
    cur.dismissed_at > prev.dismissed_at ? cur : prev,
  );
}

// ── Average cost helper ───────────────────────────────────────────────────────

/**
 * Returns the weighted average purchase price for a ticker, derived from
 * all BUY transactions in chronological order.
 */
function deriveAverageCost(
  transactions: Transaction[],
  ticker: string,
): number | null {
  const sorted = sortTransactions(transactions as never[]) as unknown as Transaction[];
  let totalShares = d(0);
  let totalCost = d(0);

  for (const tx of sorted) {
    if (
      typeof tx.ticker !== 'string' ||
      tx.ticker.toUpperCase() !== ticker.toUpperCase()
    ) continue;

    if (tx.type?.toUpperCase() === 'BUY') {
      const qty = d(tx.shares ?? tx.quantity ?? 0).abs();
      const price = qty.isZero() ? d(0) : d(tx.amount ?? 0).abs().div(qty);
      if (!qty.isZero()) {
        totalShares = totalShares.plus(qty);
        totalCost = totalCost.plus(price.times(qty));
      }
    } else if (tx.type?.toUpperCase() === 'SELL') {
      const qty = d(tx.shares ?? tx.quantity ?? 0).abs();
      totalShares = totalShares.minus(qty);
      if (totalShares.lt(0)) totalShares = d(0);
      // cost basis stays the same (FIFO approximation for avg cost denominator)
    }
  }

  if (totalShares.isZero()) return null;
  return roundDecimal(totalCost.div(totalShares), 8).toNumber();
}

// ── First buy date helper ─────────────────────────────────────────────────────

function firstTransactionDate(transactions: Transaction[], ticker: string): string | null {
  const sorted = sortTransactions(transactions as never[]) as unknown as Transaction[];
  for (const tx of sorted) {
    if (
      typeof tx.ticker === 'string' &&
      tx.ticker.toUpperCase() === ticker.toUpperCase() &&
      (tx.type?.toUpperCase() === 'BUY' || tx.type?.toUpperCase() === 'SELL')
    ) {
      return tx.date ?? null;
    }
  }
  return null;
}

// ── Main computation ──────────────────────────────────────────────────────────

export function computeInbox(input: InboxComputerInput): InboxItem[] {
  const {
    transactions = [],
    signals = {},
    priceSnapshots,
    dismissHistory = [],
    referenceDate = new Date(),
  } = input;

  const items: InboxItem[] = [];
  const todayKey = referenceDate.toISOString().slice(0, 10);

  // Derive open holdings from the projected portfolio state.
  const sorted = sortTransactions(transactions as never[]) as unknown as Transaction[];
  const lastDate =
    sorted.length > 0 ? (sorted[sorted.length - 1] as Transaction).date ?? todayKey : todayKey;
  const projected = projectStateUntil(sorted as never[], lastDate);
  const openTickers = Array.from((projected.holdings as Map<string, number>).entries())
    .filter(([, qty]) => isOpenSignalHolding(qty))
    .map(([ticker]) => ticker)
    .sort((a, b) => a.localeCompare(b));

  if (openTickers.length === 0) return [];

  // Build signal rows (reuses signal evaluation — do NOT duplicate the logic).
  const signalRows = buildPortfolioSignalRows({
    transactions: transactions as never[],
    signals,
    priceSnapshots,
  }) as Array<Record<string, unknown>>;

  const signalByTicker = new Map<string, Record<string, unknown>>();
  for (const row of signalRows) {
    if (typeof row['ticker'] === 'string') {
      signalByTicker.set(row['ticker'], row);
    }
  }

  for (const ticker of openTickers) {
    const snapshot = priceSnapshots.get(ticker) ?? { price: null, asOf: null };
    const currentPrice = snapshot.price;
    const currentPriceAsOf = snapshot.asOf;
    const sharesRaw = (projected.holdings as Map<string, number>).get(ticker) ?? 0;
    const shares = roundDecimal(d(sharesRaw), 9).toFixed(9);
    const currentValue =
      currentPrice != null
        ? roundDecimal(d(sharesRaw).times(d(currentPrice)), 2).toFixed(2)
        : null;
    const currentValueNum = currentValue != null ? Number(currentValue) : null;

    // ── THRESHOLD_TRIGGERED ────────────────────────────────────────────────
    const row = signalByTicker.get(ticker);
    if (row) {
      const status = String(row['status'] ?? '');
      if (isSignalStatusActionable(status)) {
        const thresholdPct =
          typeof row['pctWindow'] === 'number'
            ? row['pctWindow']
            : Number(resolveSignalWindow(signals, ticker));
        const eventKey = buildThresholdEventKey(
          ticker,
          status,
          thresholdPct,
          currentPriceAsOf,
        );
        if (!isDismissed(ticker, 'THRESHOLD_TRIGGERED', eventKey, dismissHistory)) {
          const direction = status === 'BUY_ZONE' ? 'below' : 'above';
          const refPrice =
            typeof row['referencePrice'] === 'number'
              ? row['referencePrice']
              : null;
          const pctFromRef =
            currentPrice != null && refPrice != null && refPrice > 0
              ? d(currentPrice).minus(d(refPrice)).div(d(refPrice)).times(100)
              : null;
          const pctStr =
            pctFromRef != null
              ? `${pctFromRef.gte(0) ? '+' : ''}${pctFromRef.toFixed(1)}%`
              : '';
          const description =
            `Threshold crossed ${direction} ${thresholdPct}% window${pctStr ? ` (currently ${pctStr})` : ''}`;
          items.push({
            ticker,
            eventType: 'THRESHOLD_TRIGGERED',
            eventKey,
            urgency: 'HIGH',
            description,
            shares,
            currentValue,
            currentPrice: currentPrice != null ? String(currentPrice) : null,
            currentPriceAsOf,
            thresholdPct,
            signalStatus: status,
          });
        }
      }
    }

    // ── LARGE_MOVE_UNREVIEWED ──────────────────────────────────────────────
    // Reference: price at last LARGE_MOVE_UNREVIEWED dismiss, else average cost.
    {
      const lastDismiss = latestDismiss(ticker, 'LARGE_MOVE_UNREVIEWED', dismissHistory);
      let refPrice: number | null = null;
      let periodStartDate: string | null = null;

      if (lastDismiss) {
        // We store the eventKey; parse period start date from it.
        // Key format: {ticker}:{sign}:{pct}:{periodStartDate}
        const parts = lastDismiss.event_key.split(':');
        periodStartDate = parts.length >= 4 ? parts[3] ?? null : null;
        // For reference price after dismiss, fall back to avg cost.
        refPrice = deriveAverageCost(transactions, ticker);
      } else {
        refPrice = deriveAverageCost(transactions, ticker);
        periodStartDate = firstTransactionDate(transactions, ticker);
      }

      if (currentPrice != null && refPrice != null && refPrice > 0) {
        const movePct = d(currentPrice)
          .minus(d(refPrice))
          .div(d(refPrice))
          .times(100)
          .toNumber();
        if (Math.abs(movePct) >= LARGE_MOVE_PCT) {
          const eventKey = buildLargeMoveEventKey(ticker, movePct, periodStartDate);
          if (!isDismissed(ticker, 'LARGE_MOVE_UNREVIEWED', eventKey, dismissHistory)) {
            const direction = movePct >= 0 ? 'up' : 'down';
            const absPct = Math.abs(movePct).toFixed(1);
            const description = `Position ${direction} ${absPct}% since last review${lastDismiss ? '' : ' (since first buy)'}`;
            items.push({
              ticker,
              eventType: 'LARGE_MOVE_UNREVIEWED',
              eventKey,
              urgency: 'HIGH',
              description,
              shares,
              currentValue,
              currentPrice: String(currentPrice),
              currentPriceAsOf,
              movePct,
            });
          }
        }
      }
    }

    // ── LONG_UNREVIEWED ────────────────────────────────────────────────────
    // Only when position ≥ $500.
    if (currentValueNum != null && currentValueNum >= MIN_POSITION_VALUE_USD) {
      const lastDismiss = latestDismiss(ticker, 'LONG_UNREVIEWED', dismissHistory);
      const referenceDate2 = lastDismiss?.dismissed_at.slice(0, 10) ??
        firstTransactionDate(transactions, ticker);

      if (referenceDate2) {
        const tradingDays = computeTradingDayAge(referenceDate2, referenceDate);
        if (tradingDays >= LONG_UNREVIEWED_DAYS) {
          const eventKey = buildLongUnreviewedEventKey(ticker, referenceDate2);
          if (!isDismissed(ticker, 'LONG_UNREVIEWED', eventKey, dismissHistory)) {
            const description = `No review in ${tradingDays} trading day${tradingDays === 1 ? '' : 's'}`;
            items.push({
              ticker,
              eventType: 'LONG_UNREVIEWED',
              eventKey,
              urgency: 'MEDIUM',
              description,
              shares,
              currentValue,
              currentPrice: currentPrice != null ? String(currentPrice) : null,
              currentPriceAsOf,
              tradingDaysUnreviewed: tradingDays,
            });
          }
        }
      }
    }

    // ── NO_THRESHOLD_CONFIGURED ────────────────────────────────────────────
    // Only when position ≥ $500 and no signal window is configured.
    if (currentValueNum != null && currentValueNum >= MIN_POSITION_VALUE_USD) {
      const signalConfigured =
        signals[ticker] != null ||
        signals[ticker.toUpperCase()] != null ||
        signals[ticker.toLowerCase()] != null;

      if (!signalConfigured) {
        const periodDate = firstTransactionDate(transactions, ticker) ?? todayKey;
        const eventKey = buildNoThresholdEventKey(ticker, periodDate);
        if (!isDismissed(ticker, 'NO_THRESHOLD_CONFIGURED', eventKey, dismissHistory)) {
          const description = `No threshold configured for a $${currentValue} position`;
          items.push({
            ticker,
            eventType: 'NO_THRESHOLD_CONFIGURED',
            eventKey,
            urgency: 'LOW',
            description,
            shares,
            currentValue,
            currentPrice: currentPrice != null ? String(currentPrice) : null,
            currentPriceAsOf,
          });
        }
      }
    }
  }

  // Sort by urgency (HIGH → MEDIUM → LOW), then alphabetically by ticker.
  items.sort((a, b) => {
    const urgencyDiff = URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency];
    if (urgencyDiff !== 0) return urgencyDiff;
    return a.ticker.localeCompare(b.ticker);
  });

  return items;
}

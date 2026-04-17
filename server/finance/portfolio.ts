// server/finance/portfolio.ts
import { toDateKey, transactionIsExternal } from './cash.js';
import { d, fromCents, fromMicroShares, roundDecimal, toCents, toMicroShares } from './decimal.js';
import type { Decimal } from 'decimal.js';
import type { ISODate } from '../types/domain.js';

// ---------------------------------------------------------------------------
// Local DB-layer types
// ---------------------------------------------------------------------------

interface TxRow {
  id?: string;
  uid?: string;
  type?: string;
  date?: string;
  amount?: number | string;
  quantity?: number | string;
  ticker?: string | null;
  portfolio_id?: string | null;
  createdAt?: number | string;
  seq?: number | string;
  metadata?: {
    system?: {
      import?: {
        source?: string;
        cashChronology?: string;
      };
    };
  };
}

interface LedgerState {
  cashCents: number;
  holdings: Map<string, number>;
}

export interface DailyState {
  date: ISODate;
  cash: number;
  holdings: Map<string, number>;
  riskValue: number;
  nav: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MICRO_SHARE_DUST_TOLERANCE = 5;
const DAY_NETTED_IMPORT_SOURCE = 'csv-bootstrap';
const DAY_NETTED_CASH_CHRONOLOGY = 'day-netted';

const HOLDINGS_TYPE_ORDER: Record<string, number> = {
  DEPOSIT: 1,
  BUY: 2,
  SELL: 3,
  DIVIDEND: 4,
  INTEREST: 5,
  WITHDRAWAL: 6,
  FEE: 7,
};

const CASH_AUDIT_TYPE_ORDER: Record<string, number> = {
  DEPOSIT: 1,
  DIVIDEND: 1,
  INTEREST: 1,
  SELL: 1,
  BUY: 2,
  WITHDRAWAL: 2,
  FEE: 2,
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function cloneHoldings(holdings: Map<string, number>): Map<string, number> {
  const result = new Map<string, number>();
  for (const [ticker, value] of holdings.entries()) {
    result.set(ticker, value);
  }
  return result;
}

function toComparableTimestamp(value: unknown): number {
  if (typeof value === 'number') {
    if (Number.isFinite(value) && value >= 0) {
      return Math.trunc(value);
    }
    return 0;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') {
      return 0;
    }
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function toComparableSeq(value: unknown): number {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') {
      return 0;
    }
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed;
  }
  return 0;
}

function compareTransactionIdentity(a: TxRow, b: TxRow): number {
  const createdAtDiff =
    toComparableTimestamp(a.createdAt) - toComparableTimestamp(b.createdAt);
  if (createdAtDiff !== 0) {
    return createdAtDiff;
  }

  const seqDiff = toComparableSeq(a.seq) - toComparableSeq(b.seq);
  if (seqDiff !== 0) {
    return seqDiff;
  }

  const idDiff = (a.id ?? '').localeCompare(b.id ?? '');
  if (idDiff !== 0) {
    return idDiff;
  }

  return (a.uid ?? '').localeCompare(b.uid ?? '');
}

function createLedgerState(): LedgerState {
  return { cashCents: 0, holdings: new Map<string, number>() };
}

function applyTransactionsThroughDate({
  state,
  transactions,
  startIndex,
  dateKey,
}: {
  state: LedgerState;
  transactions: TxRow[];
  startIndex: number;
  dateKey: string;
}): number {
  let index = startIndex;
  while (index < transactions.length && (transactions[index]?.date ?? '') <= dateKey) {
    const tx = transactions[index];
    if (tx) {
      applyTransaction(state, tx);
    }
    index += 1;
  }
  return index;
}

function holdingsToShareMap(holdingsSnapshot: Map<string, number>): Map<string, number> {
  const holdingsForOutput = new Map<string, number>();
  for (const [ticker, qtyMicro] of holdingsSnapshot.entries()) {
    holdingsForOutput.set(ticker, fromMicroShares(qtyMicro).toNumber());
  }
  return holdingsForOutput;
}

function computeRiskValueCents(
  holdingsSnapshot: Map<string, number>,
  priceMap: Map<string, unknown>,
): number {
  let riskValueCents = 0;
  for (const [ticker, qtyMicro] of holdingsSnapshot.entries()) {
    if (ticker === 'CASH') {
      continue;
    }
    const price = Number.parseFloat(String(priceMap.get(ticker) ?? 0));
    if (!Number.isFinite(price)) {
      continue;
    }
    const qty = fromMicroShares(qtyMicro);
    const value = qty.times(price);
    riskValueCents += toCents(value);
  }
  return riskValueCents;
}

function buildDailyState({
  dateKey,
  ledgerState,
  priceMap,
}: {
  dateKey: string;
  ledgerState: LedgerState;
  priceMap: Map<string, unknown>;
}): DailyState {
  const holdingsSnapshot = cloneHoldings(ledgerState.holdings);
  const riskValueCents = computeRiskValueCents(holdingsSnapshot, priceMap);
  const navCents = ledgerState.cashCents + riskValueCents;

  return {
    date: dateKey,
    cash: fromCents(ledgerState.cashCents).toNumber(),
    holdings: holdingsToShareMap(holdingsSnapshot),
    riskValue: fromCents(riskValueCents).toNumber(),
    nav: fromCents(navCents).toNumber(),
  };
}

function applyTransaction(state: LedgerState, tx: TxRow): void {
  const amount = Number.parseFloat(String(tx.amount ?? 0));
  const quantity = Number.parseFloat(String(tx.quantity ?? 0));
  const ticker = tx.ticker ?? null;

  if (Number.isFinite(amount)) {
    const amountCents = Math.abs(toCents(amount));
    if (amountCents !== 0) {
      switch (tx.type) {
        case 'DEPOSIT':
        case 'DIVIDEND':
        case 'INTEREST':
        case 'SELL':
          state.cashCents += amountCents;
          break;
        case 'WITHDRAWAL':
        case 'BUY':
        case 'FEE':
          state.cashCents -= amountCents;
          break;
        default:
          break;
      }
    }
  }

  if (ticker && ticker !== 'CASH' && Number.isFinite(quantity) && quantity !== 0) {
    const next = (state.holdings.get(ticker) ?? 0) + toMicroShares(quantity);
    setNormalizedHoldingMicro(state.holdings, ticker, next);
  }
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

export function isDayNettedImportTransaction(transaction: TxRow): boolean {
  const importMetadata = transaction?.metadata?.system?.import;
  if (!importMetadata || typeof importMetadata !== 'object') {
    return false;
  }

  if (importMetadata.cashChronology === DAY_NETTED_CASH_CHRONOLOGY) {
    return true;
  }

  return importMetadata.source === DAY_NETTED_IMPORT_SOURCE;
}

export function normalizeMicroShareBalance(value: unknown): number {
  if (!Number.isFinite(value as number)) {
    return 0;
  }
  return Math.abs(value as number) <= MICRO_SHARE_DUST_TOLERANCE ? 0 : (value as number);
}

export function setNormalizedHoldingMicro(
  holdings: Map<string, number>,
  ticker: string,
  value: number,
): number {
  const normalized = normalizeMicroShareBalance(value);
  if (normalized === 0) {
    holdings.delete(ticker);
    return 0;
  }
  holdings.set(ticker, normalized);
  return normalized;
}

export function sortTransactions(transactions: TxRow[]): TxRow[] {
  return [...transactions].sort((a, b) => {
    const dateDiff = (a.date ?? '').localeCompare(b.date ?? '');
    if (dateDiff !== 0) {
      return dateDiff;
    }

    const typeA = HOLDINGS_TYPE_ORDER[a.type ?? ''] ?? 99;
    const typeB = HOLDINGS_TYPE_ORDER[b.type ?? ''] ?? 99;
    if (typeA !== typeB) {
      return typeA - typeB;
    }

    return compareTransactionIdentity(a, b);
  });
}

export function sortTransactionsForCashAudit(transactions: TxRow[]): TxRow[] {
  return [...transactions].sort((a, b) => {
    const dateDiff = (a.date ?? '').localeCompare(b.date ?? '');
    if (dateDiff !== 0) {
      return dateDiff;
    }

    const sameDayNettedImport =
      isDayNettedImportTransaction(a) && isDayNettedImportTransaction(b);
    if (sameDayNettedImport) {
      const bucketA = CASH_AUDIT_TYPE_ORDER[a.type ?? ''] ?? 99;
      const bucketB = CASH_AUDIT_TYPE_ORDER[b.type ?? ''] ?? 99;
      if (bucketA !== bucketB) {
        return bucketA - bucketB;
      }
    }

    const identityDiff = compareTransactionIdentity(a, b);
    if (identityDiff !== 0) {
      return identityDiff;
    }

    if (!sameDayNettedImport) {
      const typeA = HOLDINGS_TYPE_ORDER[a.type ?? ''] ?? 99;
      const typeB = HOLDINGS_TYPE_ORDER[b.type ?? ''] ?? 99;
      if (typeA !== typeB) {
        return typeA - typeB;
      }
    }

    return 0;
  });
}

export interface ProjectedState {
  cash: number;
  holdings: Map<string, number>;
}

export function projectStateUntil(
  transactions: TxRow[],
  date: string | Date | number | unknown,
): ProjectedState {
  const dateKey = toDateKey(date);
  const state = createLedgerState();
  for (const tx of sortTransactions(transactions)) {
    if ((tx.date ?? '') > dateKey) {
      break;
    }
    applyTransaction(state, tx);
  }
  const holdings = new Map<string, number>();
  for (const [ticker, micro] of state.holdings.entries()) {
    holdings.set(ticker, fromMicroShares(micro).toNumber());
  }
  return {
    cash: fromCents(state.cashCents).toNumber(),
    holdings,
  };
}

export function externalFlowsByDate(
  transactions: TxRow[],
): Map<string, Decimal> {
  const flows = new Map<string, number>();
  for (const tx of transactions) {
    if (!transactionIsExternal(tx)) {
      continue;
    }
    const amount = Number.parseFloat(String(tx.amount ?? 0));
    if (!Number.isFinite(amount)) {
      continue;
    }
    const signedCents = (tx.type === 'WITHDRAWAL' ? -1 : 1) * toCents(amount);
    const current = flows.get(tx.date ?? '') ?? 0;
    flows.set(tx.date ?? '', current + signedCents);
  }
  const normalized = new Map<string, Decimal>();
  for (const [dateKey, cents] of flows.entries()) {
    normalized.set(dateKey, fromCents(cents));
  }
  return normalized;
}

export function computeDailyStates({
  transactions,
  pricesByDate,
  dates,
}: {
  transactions: TxRow[];
  pricesByDate: Map<string, Map<string, unknown>>;
  dates: string[];
}): DailyState[] {
  const sortedTransactions = sortTransactions(transactions);
  const states: DailyState[] = [];
  const ledgerState = createLedgerState();
  let txIndex = 0;

  for (const dateKey of dates) {
    txIndex = applyTransactionsThroughDate({
      state: ledgerState,
      transactions: sortedTransactions,
      startIndex: txIndex,
      dateKey,
    });
    const priceMap = pricesByDate.get(dateKey) ?? new Map<string, unknown>();
    states.push(
      buildDailyState({
        dateKey,
        ledgerState,
        priceMap,
      }),
    );
  }
  return states;
}

export function holdingsToObject(
  holdings: Map<string, number>,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [ticker, qty] of holdings.entries()) {
    result[ticker] = qty;
  }
  return result;
}

export interface PortfolioWeights {
  cash: number;
  risk: number;
}

export function weightsFromState(
  state: { nav?: number; cash?: number; riskValue?: number } | null | undefined,
): PortfolioWeights {
  if (!state || (state.nav ?? 0) <= 0) {
    return { cash: 0, risk: 0 };
  }
  return {
    cash: roundDecimal(d(state.cash ?? 0).div(state.nav ?? 1), 8).toNumber(),
    risk: roundDecimal(d(state.riskValue ?? 0).div(state.nav ?? 1), 8).toNumber(),
  };
}

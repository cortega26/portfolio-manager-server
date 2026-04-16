import Decimal from 'decimal.js';

import {
  deriveLastSignalReference,
  evaluateSignalRow,
  resolveSignalWindow as resolveSignalWindowRaw,
  SIGNAL_DEFAULT_PCT,
  SIGNAL_STATUS,
} from '../../shared/signals.js';
import { formatCurrency } from './format.js';

/**
 * Build holdings from transaction history.
 *
 * AUDIT FIX (CRITICAL-3): Added validation to prevent negative shares
 * - Clips SELL transactions to available shares
 * - Emits structured warnings for oversell attempts
 * - Handles floating-point dust with tolerance
 */
const ZERO = new Decimal(0);
const SHARE_EPSILON = new Decimal('0.0000000005');
const SHARE_DISPLAY_DECIMALS = 9;
function normalizeTicker(rawTicker) {
  return rawTicker?.trim().toUpperCase() ?? '';
}

function toDecimalOrNull(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  try {
    const decimal = new Decimal(value);
    return decimal.isFinite() ? decimal : null;
  } catch {
    return null;
  }
}

function toDecimalOrZero(value) {
  return toDecimalOrNull(value) ?? ZERO;
}

function toShareLabel(decimal) {
  const normalized = toDecimalOrZero(decimal);
  if (normalized.abs().lte(SHARE_EPSILON)) {
    return '0';
  }
  return normalized.toFixed(SHARE_DISPLAY_DECIMALS);
}

function resolveTransactionShareCount(transaction) {
  const quantity = toDecimalOrNull(transaction?.quantity);
  if (quantity && !quantity.isZero()) {
    return quantity.abs();
  }
  const shares = toDecimalOrNull(transaction?.shares);
  if (shares && !shares.isZero()) {
    return shares.abs();
  }
  return null;
}

function cloneHoldingRecord(holding) {
  return {
    ticker: holding.ticker,
    shares: holding.shares,
    cost: holding.cost,
    realised: holding.realised,
  };
}

function serializeHoldingRecord(holding) {
  return {
    ticker: holding.ticker,
    shares: toShareLabel(holding.shares),
    cost: toDecimalOrZero(holding.cost).toNumber(),
    realised: toDecimalOrZero(holding.realised).toNumber(),
  };
}

function holdingsMapToArrayInternal(map) {
  return Array.from(map.values(), (holding) => serializeHoldingRecord(holding));
}

function getOrCreateHolding(map, ticker) {
  if (!map.has(ticker)) {
    map.set(ticker, { ticker, shares: ZERO, cost: ZERO, realised: ZERO });
  }
  return map.get(ticker);
}

function applyBuy(holding, transaction) {
  holding.shares = holding.shares.plus(transaction.shares);
  holding.cost = holding.cost.plus(transaction.amount.abs());
}

function normaliseShareBook(holding) {
  if (holding.shares.abs().lte(SHARE_EPSILON)) {
    holding.shares = ZERO;
    holding.cost = ZERO;
    return;
  }
}

function emitWarning(handler, payload) {
  if (typeof handler !== 'function') {
    return;
  }
  handler({ ...payload });
}

function buildOversellWarning({ ticker, transaction, holding, sharesToSell }) {
  return {
    ticker,
    date: transaction.date,
    issue: 'oversell',
    attempted: transaction.shares.toNumber(),
    available: holding.shares.toNumber(),
    clipped: sharesToSell.toNumber(),
  };
}

function formatOversellMessage({ ticker, transaction, holding, sharesToSell }) {
  return (
    `[HOLDINGS WARNING] Cannot sell ${transaction.shares.toFixed(SHARE_DISPLAY_DECIMALS)} shares of ${ticker} on ${transaction.date}. ` +
    `Only ${holding.shares.toFixed(SHARE_DISPLAY_DECIMALS)} shares available. Clipping to available shares (${sharesToSell.toFixed(SHARE_DISPLAY_DECIMALS)}).`
  );
}

function applySell(holding, transaction, { ticker, warnings, onWarning }) {
  const avgCost = holding.shares.gt(0) ? holding.cost.div(holding.shares) : ZERO;
  const sharesToSell = Decimal.min(transaction.shares, holding.shares);

  if (transaction.shares.gt(holding.shares.plus(SHARE_EPSILON))) {
    const warning = buildOversellWarning({ ticker, transaction, holding, sharesToSell });
    warnings.push(warning);
    emitWarning(onWarning, {
      type: 'oversell',
      warning,
      message: formatOversellMessage({ ticker, transaction, holding, sharesToSell }),
    });
  }

  const costBasis = avgCost.times(sharesToSell);
  const proceeds = transaction.amount.abs();
  holding.shares = holding.shares.minus(sharesToSell);
  holding.cost = holding.cost.minus(costBasis);
  holding.realised = holding.realised.plus(proceeds.minus(costBasis));
  normaliseShareBook(holding);
}

function applyTransactionToMap(map, transaction, context) {
  const ticker = normalizeTicker(transaction.ticker);
  if (!ticker) {
    return null;
  }

  if (transaction.type !== 'BUY' && transaction.type !== 'SELL') {
    return null;
  }

  const shares = resolveTransactionShareCount(transaction);
  const amount = toDecimalOrNull(transaction?.amount);
  if (!shares || shares.lte(0) || !amount) {
    return null;
  }

  const warnings = context?.warnings ?? [];
  const onWarning = context?.onWarning;
  const normalizedTransaction = {
    ...transaction,
    shares,
    amount,
  };

  const previous = map.has(ticker) ? cloneHoldingRecord(map.get(ticker)) : null;
  const holding = getOrCreateHolding(map, ticker);

  if (transaction.type === 'BUY') {
    applyBuy(holding, normalizedTransaction);
  } else {
    applySell(holding, normalizedTransaction, { ticker, warnings, onWarning });
  }

  return { ticker, previous };
}

function buildHoldingsStateInternal(transactions, { logSummary, onWarning }) {
  const map = new Map();
  const warnings = [];
  const history = [];

  for (const transaction of transactions) {
    const change = applyTransactionToMap(map, transaction, { warnings, onWarning });
    history.push(change);
  }

  if (logSummary && warnings.length > 0) {
    emitWarning(onWarning, {
      type: 'summary',
      count: warnings.length,
      warnings: [...warnings],
    });
  }

  return {
    holdingsMap: map,
    holdings: holdingsMapToArrayInternal(map),
    history,
    warnings,
  };
}

export function cloneHoldingsMap(holdingsMap) {
  const clone = new Map();
  for (const [ticker, holding] of holdingsMap.entries()) {
    clone.set(ticker, cloneHoldingRecord(holding));
  }
  return clone;
}

export function applyTransactionSnapshot(map, transaction, warnings = [], onWarning) {
  return applyTransactionToMap(map, transaction, { warnings, onWarning });
}

export function revertTransactionSnapshot(map, snapshot) {
  if (!snapshot || !snapshot.ticker) {
    return;
  }
  if (snapshot.previous) {
    map.set(snapshot.ticker, cloneHoldingRecord(snapshot.previous));
    return;
  }
  map.delete(snapshot.ticker);
}

export function holdingsMapToArray(map) {
  return holdingsMapToArrayInternal(map);
}

export function buildHoldingsState(transactions, options = {}) {
  const settings = { logSummary: true, onWarning: null, ...options };
  return buildHoldingsStateInternal(transactions, settings);
}

export function buildHoldings(transactions) {
  return buildHoldingsStateInternal(transactions, { logSummary: true, onWarning: null }).holdings;
}

export function deriveHoldingStats(holding, currentPrice) {
  const shares = toDecimalOrZero(holding?.shares);
  const cost = toDecimalOrZero(holding?.cost);
  const realised = toDecimalOrZero(holding?.realised);
  const avgCost = shares.gt(0) ? cost.div(shares) : ZERO;
  const marketPrice = toDecimalOrNull(currentPrice);
  const hasMarketPrice = Boolean(marketPrice && marketPrice.gt(0));
  const value = hasMarketPrice ? shares.times(marketPrice) : null;
  const unrealised = hasMarketPrice ? value.minus(cost) : null;

  return {
    ...holding,
    avgCost: avgCost.toNumber(),
    value: value?.toNumber() ?? null,
    unrealised: unrealised?.toNumber() ?? null,
    priceAvailable: hasMarketPrice,
    avgCostLabel: formatCurrency(avgCost.toNumber()),
    valueLabel: hasMarketPrice ? formatCurrency(value.toNumber()) : '—',
    unrealisedLabel: hasMarketPrice ? formatCurrency(unrealised.toNumber()) : '—',
    priceLabel: hasMarketPrice ? formatCurrency(marketPrice.toNumber()) : '—',
    realisedLabel: formatCurrency(realised.toNumber()),
  };
}

export function resolveHoldingValuationPrice(holding, currentPrice) {
  const marketPrice = toDecimalOrNull(currentPrice);
  if (marketPrice && marketPrice.gt(0)) {
    return marketPrice.toNumber();
  }
  return null;
}

export function isHoldingOpen(holding) {
  const shares = toDecimalOrNull(holding?.shares);
  return Boolean(shares && shares.abs().gt(SHARE_EPSILON));
}

export function filterOpenHoldings(holdings = []) {
  if (!Array.isArray(holdings) || holdings.length === 0) {
    return [];
  }
  return holdings.filter((holding) => isHoldingOpen(holding));
}

export function resolveSignalWindow(signals, ticker, defaultPct = SIGNAL_DEFAULT_PCT) {
  return resolveSignalWindowRaw(signals, ticker, defaultPct);
}

export function deriveLastOperationReference(transactions, ticker) {
  return deriveLastSignalReference(transactions, ticker);
}

export function deriveSignalRow(holding, currentPrice, pctWindow, referenceInput = null) {
  const row = evaluateSignalRow({
    ticker: holding?.ticker,
    pctWindow,
    currentPrice,
    reference: referenceInput,
  });
  const signal =
    row.status === SIGNAL_STATUS.BUY_ZONE
      ? 'BUY zone'
      : row.status === SIGNAL_STATUS.TRIM_ZONE
        ? 'TRIM zone'
        : row.status === SIGNAL_STATUS.HOLD
          ? 'HOLD'
          : 'NO DATA';

  return {
    ticker: row.ticker,
    pctWindow: row.pctWindow ?? pctWindow,
    price: row.currentPrice !== null ? formatCurrency(row.currentPrice) : '—',
    lower: row.lowerBound !== null ? formatCurrency(row.lowerBound) : '—',
    upper: row.upperBound !== null ? formatCurrency(row.upperBound) : '—',
    signal,
    status: row.status,
    currentPriceValue: row.currentPrice,
    lowerBoundValue: row.lowerBound,
    upperBoundValue: row.upperBound,
    referencePrice: row.referencePrice,
    referenceDate: row.referenceDate,
    referenceType: row.referenceType,
    sanityRejected: row.sanityRejected,
  };
}

export function computeDashboardMetrics(holdings, currentPrices) {
  const summary = holdings.reduce(
    (acc, holding) => {
      const shares = toDecimalOrNull(holding?.shares) ?? new Decimal(0);
      const cost = toDecimalOrNull(holding?.cost) ?? new Decimal(0);
      const realised = toDecimalOrNull(holding?.realised) ?? new Decimal(0);
      acc.totalRealised = acc.totalRealised.plus(realised);
      if (!isHoldingOpen(holding)) {
        return acc;
      }

      acc.totalCost = acc.totalCost.plus(cost);
      acc.holdingsCount += 1;

      const price = toDecimalOrNull(
        resolveHoldingValuationPrice(holding, currentPrices?.[holding.ticker])
      );
      if (!price || !price.gt(0)) {
        acc.unpricedHoldingsCount += 1;
        return acc;
      }

      const value = shares.times(price);
      acc.pricedHoldingsCount += 1;
      acc.totalValue = acc.totalValue.plus(value);
      acc.totalUnrealised = acc.totalUnrealised.plus(value.minus(cost));
      return acc;
    },
    {
      totalValue: new Decimal(0),
      totalCost: new Decimal(0),
      totalRealised: new Decimal(0),
      totalUnrealised: new Decimal(0),
      holdingsCount: 0,
      pricedHoldingsCount: 0,
      unpricedHoldingsCount: 0,
    }
  );
  return {
    ...summary,
    pricingComplete: summary.unpricedHoldingsCount === 0,
  };
}

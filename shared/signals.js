import Decimal from 'decimal.js';

const ZERO = new Decimal(0);

export const SIGNAL_DEFAULT_PCT = 3;
export const SIGNAL_MAX_PRICE_DEVIATION_MULTIPLIER = new Decimal(1.25);

export const SIGNAL_STATUS = Object.freeze({
  BUY_ZONE: 'BUY_ZONE',
  TRIM_ZONE: 'TRIM_ZONE',
  HOLD: 'HOLD',
  NO_DATA: 'NO_DATA',
});

export function normalizeTickerSymbol(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
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

function resolveTransactionPrice(transaction) {
  const explicitPrice = toDecimalOrNull(transaction?.price);
  if (explicitPrice && explicitPrice.gt(0)) {
    return explicitPrice;
  }

  const shares = resolveTransactionShareCount(transaction);
  const amount = toDecimalOrNull(transaction?.amount);
  if (!shares || !amount || shares.isZero()) {
    return null;
  }

  const derived = amount.abs().div(shares);
  return derived.gt(0) ? derived : null;
}

function compareTransactions(left, right) {
  const leftDate = typeof left?.date === 'string' ? left.date : '';
  const rightDate = typeof right?.date === 'string' ? right.date : '';
  if (leftDate !== rightDate) {
    return leftDate.localeCompare(rightDate);
  }

  const leftCreatedAt =
    typeof left?.createdAt === 'number' && Number.isFinite(left.createdAt)
      ? left.createdAt
      : Number.MAX_SAFE_INTEGER;
  const rightCreatedAt =
    typeof right?.createdAt === 'number' && Number.isFinite(right.createdAt)
      ? right.createdAt
      : Number.MAX_SAFE_INTEGER;
  if (leftCreatedAt !== rightCreatedAt) {
    return leftCreatedAt - rightCreatedAt;
  }

  const leftSeq =
    typeof left?.seq === 'number' && Number.isFinite(left.seq) ? left.seq : Number.MAX_SAFE_INTEGER;
  const rightSeq =
    typeof right?.seq === 'number' && Number.isFinite(right.seq)
      ? right.seq
      : Number.MAX_SAFE_INTEGER;
  if (leftSeq !== rightSeq) {
    return leftSeq - rightSeq;
  }

  const leftUid =
    typeof left?.uid === 'string' && left.uid.trim()
      ? left.uid.trim()
      : typeof left?.id === 'string'
        ? left.id
        : '';
  const rightUid =
    typeof right?.uid === 'string' && right.uid.trim()
      ? right.uid.trim()
      : typeof right?.id === 'string'
        ? right.id
        : '';
  return leftUid.localeCompare(rightUid);
}

export function resolveSignalWindow(signals, ticker, defaultPct = SIGNAL_DEFAULT_PCT) {
  if (!signals || !ticker) {
    return defaultPct;
  }

  const normalizedTicker = normalizeTickerSymbol(ticker);
  const candidate =
    signals[ticker] ??
    signals[normalizedTicker] ??
    signals[normalizedTicker.toLowerCase?.() ?? ''] ??
    null;

  const value =
    candidate && typeof candidate === 'object'
      ? (candidate.pct ?? candidate.percent ?? candidate.windowPct ?? candidate.window)
      : candidate;

  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseFloat(value)
        : Number.NaN;

  return Number.isFinite(parsed) ? parsed : defaultPct;
}

export function deriveLastSignalReference(transactions, ticker) {
  const normalizedTicker = normalizeTickerSymbol(ticker);
  if (!normalizedTicker || !Array.isArray(transactions) || transactions.length === 0) {
    return null;
  }

  const candidates = transactions
    .filter((transaction) => {
      const type = typeof transaction?.type === 'string' ? transaction.type.toUpperCase() : '';
      return (
        normalizeTickerSymbol(transaction?.ticker) === normalizedTicker &&
        (type === 'BUY' || type === 'SELL')
      );
    })
    .sort(compareTransactions);

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const transaction = candidates[index];
    const price = resolveTransactionPrice(transaction);
    if (!price) {
      continue;
    }

    return {
      ticker: normalizedTicker,
      price: price.toNumber(),
      date: transaction.date ?? null,
      type: transaction.type ?? null,
    };
  }

  return null;
}

function normalizeSignalReference(referenceInput) {
  if (referenceInput && typeof referenceInput === 'object' && !Array.isArray(referenceInput)) {
    const price = toDecimalOrNull(referenceInput.price ?? referenceInput.referencePrice);
    if (!price || !price.gt(0)) {
      return null;
    }

    return {
      price,
      date: referenceInput.date ?? null,
      type: referenceInput.type ?? null,
    };
  }

  const price = toDecimalOrNull(referenceInput);
  if (!price || !price.gt(0)) {
    return null;
  }

  return {
    price,
    date: null,
    type: null,
  };
}

export function evaluateSignalRow({
  ticker,
  pctWindow,
  currentPrice,
  currentPriceAsOf = null,
  reference = null,
} = {}) {
  const normalizedTicker = normalizeTickerSymbol(ticker);
  const normalizedReference = normalizeSignalReference(reference);
  const current = toDecimalOrNull(currentPrice);
  const pct = toDecimalOrNull(pctWindow);

  if (!normalizedTicker || !current || !normalizedReference || !pct || pct.lt(0)) {
    return {
      ticker: normalizedTicker,
      pctWindow:
        typeof pctWindow === 'number'
          ? pctWindow
          : Number.isFinite(Number(pctWindow))
            ? Number(pctWindow)
            : null,
      status: SIGNAL_STATUS.NO_DATA,
      currentPrice: current?.toNumber() ?? null,
      currentPriceAsOf,
      lowerBound: null,
      upperBound: null,
      referencePrice: normalizedReference?.price?.toNumber() ?? null,
      referenceDate: normalizedReference?.date ?? null,
      referenceType: normalizedReference?.type ?? null,
      sanityRejected: false,
    };
  }

  const sanityLower = normalizedReference.price.div(SIGNAL_MAX_PRICE_DEVIATION_MULTIPLIER);
  const sanityUpper = normalizedReference.price.times(SIGNAL_MAX_PRICE_DEVIATION_MULTIPLIER);
  if (current.lt(sanityLower) || current.gt(sanityUpper)) {
    return {
      ticker: normalizedTicker,
      pctWindow: pct.toNumber(),
      status: SIGNAL_STATUS.NO_DATA,
      currentPrice: current.toNumber(),
      currentPriceAsOf,
      lowerBound: null,
      upperBound: null,
      referencePrice: normalizedReference.price.toNumber(),
      referenceDate: normalizedReference.date,
      referenceType: normalizedReference.type,
      sanityRejected: true,
    };
  }

  const pctRatio = pct.div(100);
  const lowerBound = normalizedReference.price.times(new Decimal(1).minus(pctRatio));
  const upperBound = normalizedReference.price.times(new Decimal(1).plus(pctRatio));

  let status = SIGNAL_STATUS.HOLD;
  if (current.lte(lowerBound)) {
    status = SIGNAL_STATUS.BUY_ZONE;
  } else if (current.gte(upperBound)) {
    status = SIGNAL_STATUS.TRIM_ZONE;
  }

  return {
    ticker: normalizedTicker,
    pctWindow: pct.toNumber(),
    status,
    currentPrice: current.toNumber(),
    currentPriceAsOf,
    lowerBound: lowerBound.toNumber(),
    upperBound: upperBound.toNumber(),
    referencePrice: normalizedReference.price.toNumber(),
    referenceDate: normalizedReference.date,
    referenceType: normalizedReference.type,
    sanityRejected: false,
  };
}

export function isSignalStatusActionable(status) {
  return status === SIGNAL_STATUS.BUY_ZONE || status === SIGNAL_STATUS.TRIM_ZONE;
}

export function isOpenSignalHolding(quantity) {
  const shares = toDecimalOrNull(quantity) ?? ZERO;
  return shares.gt(0);
}

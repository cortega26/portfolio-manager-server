// server/services/portfolioTransactions.js
// Extracted business logic for portfolio transaction validation and normalization.
// Used by both the Express (app.js) and Fastify (routes/portfolio.ts) handlers.

import { randomUUID } from 'crypto';
import {
  normalizeMicroShareBalance,
  setNormalizedHoldingMicro,
  sortTransactions,
  sortTransactionsForCashAudit,
} from '../finance/portfolio.js';
import {
  d,
  fromCents,
  fromMicroShares,
  roundDecimal,
  toCents,
  toMicroShares,
} from '../finance/decimal.js';

/**
 * Creates an HTTP error object with the given properties.
 * @param {{ status: number, code: string, message: string, details?: unknown, expose?: boolean }} opts
 */
function createHttpError({ status, code, message, details, expose = false }) {
  const err = new Error(message);
  err.statusCode = status;
  err.status = status;
  err.code = code;
  err.expose = expose;
  if (details !== undefined) {
    err.details = details;
  }
  return err;
}

/**
 * Ensures all transactions have a uid, createdAt, and seq.
 * Deduplicates by uid and throws a 409 error if duplicates are found.
 *
 * @param {unknown[]} transactions
 * @param {string} portfolioId
 * @param {{ warn?: (msg: string, meta?: object) => void }} [logger]
 * @returns {object[]}
 */
export function ensureTransactionUids(transactions, portfolioId, logger) {
  const seen = new Set();
  const deduplicated = [];
  const duplicates = new Set();
  let timestampCursor = 0;
  let seqCursor = -1;

  for (const transaction of transactions) {
    const base = transaction && typeof transaction === 'object' ? transaction : {};
    const rawUid = typeof base.uid === 'string' ? base.uid.trim() : '';
    const uid = rawUid ? rawUid : randomUUID();

    if (seen.has(uid)) {
      duplicates.add(uid);
      continue;
    }
    seen.add(uid);

    let numericCreatedAt = Number.NaN;
    if (typeof base.createdAt === 'number') {
      numericCreatedAt = Number.isFinite(base.createdAt) ? Math.trunc(base.createdAt) : Number.NaN;
    } else if (typeof base.createdAt === 'string') {
      const trimmed = base.createdAt.trim();
      if (trimmed !== '') {
        const parsed = Number.parseInt(trimmed, 10);
        numericCreatedAt = Number.isNaN(parsed) ? Number.NaN : parsed;
      }
    }

    let createdAt =
      Number.isFinite(numericCreatedAt) && numericCreatedAt >= 0 ? numericCreatedAt : Date.now();
    if (createdAt <= timestampCursor) {
      createdAt = timestampCursor + 1;
    }
    timestampCursor = createdAt;

    let numericSeq = Number.NaN;
    if (typeof base.seq === 'number') {
      numericSeq = Number.isFinite(base.seq) ? Math.trunc(base.seq) : Number.NaN;
    } else if (typeof base.seq === 'string') {
      const trimmedSeq = base.seq.trim();
      if (trimmedSeq !== '') {
        const parsedSeq = Number.parseInt(trimmedSeq, 10);
        numericSeq = Number.isNaN(parsedSeq) ? Number.NaN : parsedSeq;
      }
    }

    let seq =
      Number.isInteger(numericSeq) && numericSeq >= 0 ? numericSeq : seqCursor + 1;
    if (seq <= seqCursor) {
      seq = seqCursor + 1;
    }
    seqCursor = seq;

    // Compute quantity from shares if not already set
    const normalizedBase = { ...base, uid, createdAt, seq };
    if (typeof normalizedBase.quantity !== 'number' && typeof normalizedBase.shares === 'number') {
      const shares = normalizedBase.shares;
      switch (normalizedBase.type) {
        case 'SELL':
          normalizedBase.quantity = -Math.abs(shares);
          break;
        case 'BUY':
          normalizedBase.quantity = Math.abs(shares);
          break;
        default:
          break;
      }
    }
    // Normalize ticker to uppercase
    if (typeof normalizedBase.ticker === 'string') {
      normalizedBase.ticker = normalizedBase.ticker.toUpperCase();
    }
    deduplicated.push(normalizedBase);
  }
  if (duplicates.size > 0) {
    const duplicateList = Array.from(duplicates);
    logger?.warn?.('duplicate_transaction_uids_filtered', {
      id: portfolioId,
      duplicates: duplicateList,
    });
    throw createHttpError({
      status: 409,
      code: 'DUPLICATE_TRANSACTION_UID',
      message: 'Duplicate transaction identifiers detected.',
      details: { portfolioId, duplicates: duplicateList },
      expose: true,
    });
  }

  return deduplicated;
}

/**
 * Validates that cash never goes negative after sorting transactions.
 * Throws a 400 error on violation.
 *
 * @param {object[]} transactions
 * @param {{ portfolioId: string, logger?: { warn?: Function } }} opts
 */
export function enforceNonNegativeCash(transactions, { portfolioId, logger }) {
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return;
  }

  const normalizeCurrencyCode = (value) => {
    if (typeof value !== 'string') return 'USD';
    const normalized = value.trim().toUpperCase();
    return /^[A-Z]{3}$/u.test(normalized) ? normalized : 'USD';
  };

  const sorted = sortTransactionsForCashAudit(transactions);
  const cashByCurrency = new Map();

  for (const tx of sorted) {
    if (!tx || typeof tx !== 'object') continue;
    const amount = Number.parseFloat(tx.amount ?? 0);
    if (!Number.isFinite(amount)) continue;
    const cents = Math.abs(toCents(amount));
    const currency = normalizeCurrencyCode(tx.currency);
    const previousCents = cashByCurrency.get(currency) ?? 0;
    let nextCents = previousCents;

    switch (tx.type) {
      case 'DEPOSIT':
      case 'DIVIDEND':
      case 'INTEREST':
      case 'SELL':
        nextCents += cents;
        break;
      case 'WITHDRAWAL':
      case 'BUY':
      case 'FEE':
        nextCents -= cents;
        break;
      default:
        continue;
    }

    cashByCurrency.set(currency, nextCents);

    if (nextCents < 0) {
      const deficitDecimal = roundDecimal(fromCents(-nextCents), 2);
      const balanceDecimal = roundDecimal(fromCents(previousCents), 2);
      const deficit = deficitDecimal.toNumber();
      const balance = balanceDecimal.toNumber();
      logger?.warn?.('cash_overdraw_rejected', {
        id: portfolioId,
        date: tx.date,
        type: tx.type,
        amount,
        deficit,
        balance,
        currency,
      });
      throw createHttpError({
        status: 400,
        code: 'E_CASH_OVERDRAW',
        message: `Cash balance cannot go negative. Deficit of ${deficitDecimal.toFixed(2)} detected.`,
        details: { date: tx.date, type: tx.type, amount, deficit, balance, currency },
        expose: true,
      });
    }
  }
}

/**
 * Validates that sells don't exceed available shares.
 * If autoClip is true, clips oversell quantities in-place instead of rejecting.
 *
 * @param {object[]} transactions - mutated in-place when autoClip is true
 * @param {{ portfolioId: string, autoClip: boolean, logger?: { info?: Function, warn?: Function } }} opts
 */
export function enforceOversellPolicy(transactions, { portfolioId, autoClip, logger }) {
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return;
  }

  const holdingsMicro = new Map();
  const ordered = sortTransactions(transactions);

  for (const tx of ordered) {
    if (!tx || typeof tx !== 'object') continue;
    const ticker = tx.ticker;
    if (!ticker || ticker === 'CASH') continue;

    if (tx.type === 'BUY') {
      const rawQuantity = Number.isFinite(tx.quantity)
        ? tx.quantity
        : Number.isFinite(tx.shares)
          ? Math.abs(tx.shares)
          : 0;
      const micro = Math.max(0, toMicroShares(rawQuantity));
      if (micro === 0) continue;
      const current = holdingsMicro.get(ticker) ?? 0;
      setNormalizedHoldingMicro(holdingsMicro, ticker, current + micro);
      continue;
    }

    if (tx.type !== 'SELL') continue;

    const requestedMicro = Math.abs(
      toMicroShares(
        Number.isFinite(tx.quantity)
          ? tx.quantity
          : Number.isFinite(tx.shares)
            ? -Math.abs(tx.shares)
            : 0,
      ),
    );
    if (requestedMicro === 0) continue;

    const availableMicro = holdingsMicro.get(ticker) ?? 0;
    const remainingMicro = normalizeMicroShareBalance(availableMicro - requestedMicro);

    if (remainingMicro >= 0) {
      if (requestedMicro > availableMicro) {
        logger?.info?.('oversell_dust_absorbed', {
          id: portfolioId,
          ticker,
          date: tx.date,
          requested_micro: requestedMicro,
          available_micro: availableMicro,
        });
      }
      setNormalizedHoldingMicro(holdingsMicro, ticker, remainingMicro);
      continue;
    }

    const requestedShares = roundDecimal(fromMicroShares(requestedMicro), 6).toNumber();
    const availableShares = roundDecimal(fromMicroShares(availableMicro), 6).toNumber();

    if (!autoClip) {
      logger?.warn?.('oversell_rejected', {
        id: portfolioId,
        ticker,
        date: tx.date,
        requested_shares: requestedShares,
        available_shares: availableShares,
      });
      throw createHttpError({
        status: 400,
        code: 'E_OVERSELL',
        message: `Cannot sell ${requestedShares} shares of ${ticker}. Only ${availableShares} available.`,
        details: { ticker, requested: requestedShares, available: availableShares, date: tx.date },
        expose: true,
      });
    }

    const clippedMicro = availableMicro;
    const clippedSharesDecimal = roundDecimal(fromMicroShares(clippedMicro), 6);
    const clippedShares = clippedSharesDecimal.toNumber();
    const originalShares = Number.isFinite(tx.shares) ? Math.abs(tx.shares) : requestedShares;

    let adjustedAmount = 0;
    if (originalShares > 0 && Number.isFinite(tx.amount) && tx.amount !== 0) {
      const perShare = d(Math.abs(tx.amount)).div(originalShares);
      const newAmountDecimal = perShare.times(clippedSharesDecimal);
      const signedAmount = tx.amount >= 0 ? newAmountDecimal : newAmountDecimal.neg();
      adjustedAmount = roundDecimal(signedAmount, 6).toNumber();
    }
    if (clippedShares === 0) {
      adjustedAmount = 0;
    }

    tx.quantity = clippedShares === 0 ? 0 : -clippedShares;
    tx.shares = clippedShares;
    tx.amount = adjustedAmount;

    const metadata =
      tx.metadata && typeof tx.metadata === 'object' ? { ...tx.metadata } : {};
    const systemMeta =
      metadata.system && typeof metadata.system === 'object' ? { ...metadata.system } : {};
    systemMeta.oversell_clipped = {
      requested_shares: requestedShares,
      available_shares: availableShares,
      delivered_shares: clippedShares,
    };
    metadata.system = systemMeta;
    tx.metadata = metadata;

    setNormalizedHoldingMicro(holdingsMicro, ticker, 0);

    logger?.warn?.('oversell_clipped', {
      id: portfolioId,
      ticker,
      date: tx.date,
      requested_shares: requestedShares,
      delivered_shares: clippedShares,
    });
  }
}

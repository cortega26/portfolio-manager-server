import { useMemo } from "react";
import Decimal from "decimal.js";

const CASH_IN_TYPES = new Set(["DEPOSIT", "DIVIDEND", "INTEREST"]);
const CASH_OUT_TYPES = new Set(["WITHDRAWAL", "FEE"]);
const STOCK_BUY_TYPES = new Set(["BUY"]);
const STOCK_SELL_TYPES = new Set(["SELL"]);
const EXTERNAL_IN_TYPES = new Set(["DEPOSIT"]);
const EXTERNAL_OUT_TYPES = new Set(["WITHDRAWAL"]);
const INCOME_IN_TYPES = new Set(["DIVIDEND", "INTEREST"]);
const INCOME_OUT_TYPES = new Set(["FEE"]);

function normalizeType(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function safeNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function toDecimal(value) {
  try {
    const decimal = new Decimal(value ?? 0);
    return decimal.isFinite() ? decimal : new Decimal(0);
  } catch {
    return new Decimal(0);
  }
}

export function computeCashBalance(transactions = []) {
  const balance = transactions.reduce((runningBalance, transaction) => {
    if (!transaction) {
      return runningBalance;
    }
    const type = normalizeType(transaction.type);
    const amount = toDecimal(transaction.amount);

    if (type === "BUY") {
      return runningBalance.minus(amount.abs());
    }
    if (type === "SELL") {
      return runningBalance.plus(amount.abs());
    }
    if (CASH_IN_TYPES.has(type)) {
      return runningBalance.plus(amount);
    }
    if (CASH_OUT_TYPES.has(type)) {
      return runningBalance.minus(amount.abs());
    }
    return runningBalance;
  }, new Decimal(0));

  return balance.toNumber();
}

export function summarizePortfolioFlows(transactions = []) {
  return transactions.reduce(
    (summary, transaction) => {
      if (!transaction) {
        return summary;
      }

      const type = normalizeType(transaction.type);
      const amount = toDecimal(transaction.amount);

      if (EXTERNAL_IN_TYPES.has(type)) {
        summary.netContributions = summary.netContributions.plus(amount);
      } else if (EXTERNAL_OUT_TYPES.has(type)) {
        summary.netContributions = summary.netContributions.minus(amount.abs());
      }

      if (STOCK_BUY_TYPES.has(type)) {
        summary.grossBuys = summary.grossBuys.plus(amount.abs());
        summary.netStockPurchases = summary.netStockPurchases.plus(amount.abs());
      } else if (STOCK_SELL_TYPES.has(type)) {
        summary.grossSells = summary.grossSells.plus(amount.abs());
        summary.netStockPurchases = summary.netStockPurchases.minus(amount.abs());
      }

      if (INCOME_IN_TYPES.has(type)) {
        summary.netIncome = summary.netIncome.plus(amount);
      } else if (INCOME_OUT_TYPES.has(type)) {
        summary.netIncome = summary.netIncome.minus(amount.abs());
      }

      return summary;
    },
    {
      netContributions: new Decimal(0),
      netStockPurchases: new Decimal(0),
      netIncome: new Decimal(0),
      grossBuys: new Decimal(0),
      grossSells: new Decimal(0),
    },
  );
}

export function resolveLatestRoiSnapshot(roiData = []) {
  for (let index = roiData.length - 1; index >= 0; index -= 1) {
    const entry = roiData[index];
    if (!entry) {
      continue;
    }
    const portfolio = safeNumber(entry.portfolio);
    const spy = safeNumber(entry.spy);
    const qqq = safeNumber(entry.qqq);
    const blended = safeNumber(entry.blended);
    const exCash = safeNumber(entry.exCash);
    const cash = safeNumber(entry.cash);
    if (portfolio || spy || qqq || blended || exCash || cash) {
      return { portfolio, spy, qqq, blended, exCash, cash };
    }
  }
  return { portfolio: 0, spy: 0, qqq: 0, blended: 0, exCash: 0, cash: 0 };
}

export function deriveDashboardMetrics({ metrics, transactions, roiData } = {}) {
  const rawTotalValue = safeNumber(metrics?.totalValue);
  const positionCost = safeNumber(metrics?.totalCost);
  const totalRealised = safeNumber(metrics?.totalRealised);
  const rawTotalUnrealised = safeNumber(metrics?.totalUnrealised);
  const holdingsCount = Math.max(0, Math.trunc(safeNumber(metrics?.holdingsCount)));
  const pricedHoldingsCount = Math.max(0, Math.trunc(safeNumber(metrics?.pricedHoldingsCount)));
  const unpricedHoldingsCount = Math.max(0, Math.trunc(safeNumber(metrics?.unpricedHoldingsCount)));
  const pricingComplete = unpricedHoldingsCount === 0;

  const cashBalance = computeCashBalance(transactions);
  const {
    netContributions,
    netStockPurchases,
    netIncome,
    grossBuys,
    grossSells,
  } = summarizePortfolioFlows(transactions);
  const totalValue = pricingComplete ? rawTotalValue : null;
  const totalUnrealised = pricingComplete ? rawTotalUnrealised : null;
  const historicalChange = pricingComplete
    ? new Decimal(rawTotalValue).minus(netStockPurchases).toNumber()
    : null;
  const totalReturn = pricingComplete
    ? new Decimal(totalRealised).plus(rawTotalUnrealised).plus(netIncome).toNumber()
    : null;
  const totalNav = pricingComplete ? rawTotalValue + cashBalance : null;
  const returnPct =
    !pricingComplete || netContributions.isZero()
      ? null
      : new Decimal(totalReturn).div(netContributions).times(100).toNumber();
  const totalRoiPct =
    !pricingComplete || netContributions.isZero()
      ? null
      : new Decimal(totalNav).minus(netContributions).div(netContributions).times(100).toNumber();

  const latest = resolveLatestRoiSnapshot(roiData);
  const cashAllocationPct =
    pricingComplete && totalNav !== 0 ? (cashBalance / totalNav) * 100 : null;
  const cashDragPct = latest.spy - latest.blended;
  const spyDeltaPct = latest.portfolio - latest.spy;
  const qqqDeltaPct = latest.portfolio - latest.qqq;
  const blendedDeltaPct = latest.portfolio - latest.blended;

  return {
    totals: {
      totalValue,
      totalCost: positionCost,
      positionCost,
      netContributions: netContributions.toNumber(),
      netStockPurchases: netStockPurchases.toNumber(),
      netIncome: netIncome.toNumber(),
      grossBuys: grossBuys.toNumber(),
      grossSells: grossSells.toNumber(),
      totalRealised,
      totalUnrealised,
      historicalChange,
      totalReturn,
      totalNav,
      totalRoiPct,
      cashBalance,
      holdingsCount,
      pricedHoldingsCount,
      unpricedHoldingsCount,
      pricingComplete,
    },
    percentages: {
      returnPct,
      cashAllocationPct,
      cashDragPct,
      spyDeltaPct,
      qqqDeltaPct,
      blendedDeltaPct,
    },
    latest,
  };
}

export function usePortfolioMetrics({ metrics, transactions, roiData } = {}) {
  return useMemo(
    () => deriveDashboardMetrics({ metrics, transactions, roiData }),
    [metrics, transactions, roiData],
  );
}

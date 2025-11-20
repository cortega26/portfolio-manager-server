// @ts-nocheck
import { useMemo } from "react";

const CASH_IN_TYPES = new Set(["DEPOSIT", "DIVIDEND", "INTEREST"]);
const CASH_OUT_TYPES = new Set(["WITHDRAWAL", "FEE"]);

function normalizeType(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function safeNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function computeCashBalance(transactions = []) {
  return transactions.reduce((balance, transaction) => {
    if (!transaction) {
      return balance;
    }
    const type = normalizeType(transaction.type);
    const amount = Number.parseFloat(transaction.amount ?? 0);
    if (!Number.isFinite(amount)) {
      return balance;
    }

    if (type === "BUY") {
      return balance - Math.abs(amount);
    }
    if (type === "SELL") {
      return balance + Math.abs(amount);
    }
    if (CASH_IN_TYPES.has(type)) {
      return balance + amount;
    }
    if (CASH_OUT_TYPES.has(type)) {
      return balance - Math.abs(amount);
    }
    return balance;
  }, 0);
}

export function resolveLatestRoiSnapshot(roiData = []) {
  for (let index = roiData.length - 1; index >= 0; index -= 1) {
    const entry = roiData[index];
    if (!entry) {
      continue;
    }
    const portfolio = safeNumber(entry.portfolio);
    const spy = safeNumber(entry.spy);
    const blended = safeNumber(entry.blended);
    const exCash = safeNumber(entry.exCash);
    const cash = safeNumber(entry.cash);
    if (portfolio || spy || blended || exCash || cash) {
      return { portfolio, spy, blended, exCash, cash };
    }
  }
  return { portfolio: 0, spy: 0, blended: 0, exCash: 0, cash: 0 };
}

export function deriveDashboardMetrics({ metrics, transactions, roiData } = {}) {
  const totalValue = safeNumber(metrics?.totalValue);
  const totalCost = safeNumber(metrics?.totalCost);
  const totalRealised = safeNumber(metrics?.totalRealised);
  const totalUnrealised = safeNumber(metrics?.totalUnrealised);
  const holdingsCount = Math.max(0, Math.trunc(safeNumber(metrics?.holdingsCount)));

  const cashBalance = computeCashBalance(transactions);
  const totalReturn = totalRealised + totalUnrealised;
  const returnPct = totalCost === 0 ? 0 : (totalReturn / totalCost) * 100;
  const totalNav = totalValue + cashBalance;

  const latest = resolveLatestRoiSnapshot(roiData);
  const cashAllocationPct = totalNav === 0 ? 0 : (cashBalance / totalNav) * 100;
  const cashDragPct = latest.spy - latest.blended;
  const spyDeltaPct = latest.portfolio - latest.spy;
  const blendedDeltaPct = latest.portfolio - latest.blended;

  return {
    totals: {
      totalValue,
      totalCost,
      totalRealised,
      totalUnrealised,
      totalReturn,
      totalNav,
      cashBalance,
      holdingsCount,
    },
    percentages: {
      returnPct,
      cashAllocationPct,
      cashDragPct,
      spyDeltaPct,
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

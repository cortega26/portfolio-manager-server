const TYPE_ORDER = {
  DEPOSIT: 1,
  BUY: 2,
  SELL: 3,
  DIVIDEND: 4,
  INTEREST: 5,
  WITHDRAWAL: 6,
  FEE: 7,
};

const CASH_IN_TYPES = new Set(["DEPOSIT", "DIVIDEND", "INTEREST", "SELL"]);
const CASH_OUT_TYPES = new Set(["WITHDRAWAL", "BUY", "FEE"]);

function toComparableTimestamp(value) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") {
      return 0;
    }
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function toComparableSeq(value) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") {
      return 0;
    }
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed;
  }
  return 0;
}

function sortTransactionsForCashCheck(transactions) {
  return [...transactions].sort((a, b) => {
    const dateA = typeof a.date === "string" ? a.date : "";
    const dateB = typeof b.date === "string" ? b.date : "";
    const dateDiff = dateA.localeCompare(dateB);
    if (dateDiff !== 0) {
      return dateDiff;
    }

    const orderA = TYPE_ORDER[a.type] ?? 99;
    const orderB = TYPE_ORDER[b.type] ?? 99;
    if (orderA !== orderB) {
      return orderA - orderB;
    }

    const createdDiff =
      toComparableTimestamp(a.createdAt) - toComparableTimestamp(b.createdAt);
    if (createdDiff !== 0) {
      return createdDiff;
    }

    const seqDiff = toComparableSeq(a.seq) - toComparableSeq(b.seq);
    if (seqDiff !== 0) {
      return seqDiff;
    }

    const idDiff = String(a.id ?? "").localeCompare(String(b.id ?? ""));
    if (idDiff !== 0) {
      return idDiff;
    }

    return String(a.uid ?? "").localeCompare(String(b.uid ?? ""));
  });
}

function toCents(amount) {
  const parsed = Number.parseFloat(amount ?? 0);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.round(Math.abs(parsed) * 100);
}

export function validateNonNegativeCash(transactions) {
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return { ok: true };
  }

  const sorted = sortTransactionsForCashCheck(transactions);
  let cashCents = 0;
  for (const tx of sorted) {
    const cents = toCents(tx.amount);
    if (cents === 0) {
      continue;
    }

    const type = String(tx.type ?? "").toUpperCase();
    if (CASH_IN_TYPES.has(type)) {
      cashCents += cents;
    } else if (CASH_OUT_TYPES.has(type)) {
      cashCents -= cents;
    } else {
      cashCents += (tx.amount ?? 0) >= 0 ? cents : -cents;
    }

    if (cashCents < 0 && type === "WITHDRAWAL") {
      return {
        ok: false,
        deficit: Math.abs(cashCents) / 100,
        failingTransaction: tx,
      };
    }
  }

  return { ok: true };
}

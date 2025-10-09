import { formatCurrency } from "./format.js";

const CASH_IN_TYPES = new Set(["DEPOSIT", "DIVIDEND", "INTEREST", "SELL"]);
const CASH_OUT_TYPES = new Set(["WITHDRAWAL", "BUY", "FEE"]);

function toLocalDate(dateString) {
  if (typeof dateString !== "string" || dateString.trim() === "") {
    return null;
  }
  const parts = dateString.split("-");
  if (parts.length !== 3) {
    return null;
  }
  const [yearPart, monthPart, dayPart] = parts;
  const year = Number.parseInt(yearPart, 10);
  const month = Number.parseInt(monthPart, 10);
  const day = Number.parseInt(dayPart, 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function parseMonthKey(dateString) {
  const parsed = toLocalDate(dateString);
  if (!parsed) {
    return null;
  }

  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const year = parsed.getFullYear();
  const label = parsed.toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });
  return { key: `${year}-${month}`, label };
}

function describeTransaction(transaction) {
  const amountLabel = formatCurrency(transaction.amount);
  const shareLabel = transaction.shares
    ? `${transaction.shares.toFixed(4)} shares`
    : "cash movement";

  switch (transaction.type) {
    case "BUY":
      return `Bought ${shareLabel} of ${transaction.ticker} at ${formatCurrency(transaction.price)} (${amountLabel}).`;
    case "SELL":
      return `Sold ${shareLabel} of ${transaction.ticker} for ${amountLabel}.`;
    case "DIVIDEND":
      return `Recorded dividend from ${transaction.ticker} worth ${amountLabel}.`;
    case "DEPOSIT":
      return `Deposited ${amountLabel} into the account.`;
    case "WITHDRAWAL":
    case "WITHDRAW":
      return `Withdrew ${amountLabel} from the account.`;
    default:
      return `Logged ${amountLabel} for ${transaction.ticker ?? "portfolio"}.`;
  }
}

export function groupTransactionsByMonth(transactions) {
  if (!Array.isArray(transactions)) {
    return [];
  }

  const map = new Map();
  transactions.forEach((transaction) => {
    const parsed = parseMonthKey(transaction.date);
    if (!parsed) {
      return;
    }

    if (!map.has(parsed.key)) {
      map.set(parsed.key, {
        month: parsed.key,
        label: parsed.label,
        inflows: 0,
        outflows: 0,
        net: 0,
        count: 0,
      });
    }

    const row = map.get(parsed.key);
    const amount = Number(transaction.amount) || 0;
    const absoluteAmount = Math.abs(amount);
    const type = String(transaction.type ?? "").toUpperCase();

    let direction = 0;
    if (CASH_IN_TYPES.has(type)) {
      direction = 1;
    } else if (CASH_OUT_TYPES.has(type)) {
      direction = -1;
    } else {
      direction = amount >= 0 ? 1 : -1;
    }

    if (direction >= 0) {
      row.inflows += absoluteAmount;
    } else {
      row.outflows += absoluteAmount;
    }
    row.net += direction * absoluteAmount;
    row.count += 1;
  });

  return Array.from(map.values()).sort((a, b) => (a.month < b.month ? 1 : -1));
}

export function buildTransactionTimeline(transactions) {
  if (!Array.isArray(transactions)) {
    return [];
  }

  return [...transactions]
    .filter((transaction) => Boolean(parseMonthKey(transaction.date)))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 20)
    .map((transaction) => {
      const parsed = toLocalDate(transaction.date);
      if (!parsed) {
        return null;
      }
      const dateLabel = parsed.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      const typeLabel = transaction.type ?? "Activity";
      return {
        date: transaction.date,
        dateLabel,
        typeLabel,
        title: `${transaction.ticker ?? "Portfolio"} ${typeLabel}`,
        description: describeTransaction(transaction),
      };
    })
    .filter(Boolean);
}

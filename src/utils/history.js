import { formatCurrency } from "./format.js";

function parseMonthKey(dateString) {
  if (!dateString) {
    return null;
  }

  const parsed = new Date(dateString);
  if (Number.isNaN(parsed.getTime())) {
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
    if (amount >= 0) {
      row.inflows += amount;
    } else {
      row.outflows += Math.abs(amount);
    }
    row.net += amount;
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
      const parsed = new Date(transaction.date);
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
    });
}

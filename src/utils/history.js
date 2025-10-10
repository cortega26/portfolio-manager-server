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

function parseMonthKey(dateString, locale) {
  const parsed = toLocalDate(dateString);
  if (!parsed) {
    return null;
  }

  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const year = parsed.getFullYear();
  const label = parsed.toLocaleString(locale, {
    month: "long",
    year: "numeric",
  });
  return { key: `${year}-${month}`, label };
}

export function groupTransactionsByMonth(transactions, { locale } = {}) {
  if (!Array.isArray(transactions)) {
    return [];
  }

  const map = new Map();
  transactions.forEach((transaction) => {
    const parsed = parseMonthKey(transaction.date, locale);
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

export function buildTransactionTimeline(
  transactions,
  { locale, formatCurrency, translate, formatDate },
) {
  if (!Array.isArray(transactions)) {
    return [];
  }

  const formatDateLabel =
    typeof formatDate === "function"
      ? (value) => formatDate(value, { month: "short", day: "numeric", year: "numeric" })
      : (value) => {
          const parsed = toLocalDate(value);
          if (!parsed) {
            return value;
          }
          return parsed.toLocaleDateString(locale, {
            month: "short",
            day: "numeric",
            year: "numeric",
          });
        };

  const describeTransaction = (transaction) => {
    if (typeof formatCurrency !== "function" || typeof translate !== "function") {
      return null;
    }
    const amountLabel = formatCurrency(transaction.amount);
    switch (transaction.type) {
      case "DEPOSIT":
        return translate("history.timeline.deposit", { amount: amountLabel });
      case "WITHDRAWAL":
      case "WITHDRAW":
        return translate("history.timeline.withdraw", { amount: amountLabel });
      default:
        return null;
    }
  };

  return [...transactions]
    .filter((transaction) => Boolean(parseMonthKey(transaction.date, locale)))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 20)
    .map((transaction) => {
      const dateLabel = formatDateLabel(transaction.date);
      const typeLabel = transaction.type ?? "Activity";
      return {
        date: transaction.date,
        dateLabel,
        typeLabel,
        title: `${transaction.ticker ?? "Portfolio"} ${typeLabel}`,
        description: describeTransaction(transaction),
        transaction,
      };
    })
    .filter(Boolean);
}

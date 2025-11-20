// @ts-nocheck
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
  { locale, formatCurrency, formatNumber, translate, formatDate } = {},
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
      const ticker = typeof transaction.ticker === "string" ? transaction.ticker : null;
      const shareValue =
        typeof transaction.shares === "number"
          ? transaction.shares
          : typeof transaction.shares === "string"
            ? Number.parseFloat(transaction.shares)
            : Number.NaN;
      const sharesLabel =
        typeof formatNumber === "function" && Number.isFinite(shareValue)
          ? formatNumber(shareValue, {
              minimumFractionDigits: 0,
              maximumFractionDigits: 6,
            })
          : null;
      const fallbackShares =
        sharesLabel ?? (Number.isFinite(shareValue) ? String(shareValue) : "—");
      switch (transaction.type) {
        case "DEPOSIT":
          return translate("history.timeline.deposit", { amount: amountLabel });
        case "WITHDRAWAL":
        case "WITHDRAW":
          return translate("history.timeline.withdraw", { amount: amountLabel });
        case "BUY":
          return translate("history.timeline.buy", {
            amount: amountLabel,
            shares: fallbackShares,
            ticker: ticker ?? translate("history.timeline.portfolioFallback"),
          });
        case "SELL":
          return translate("history.timeline.sell", {
            amount: amountLabel,
            shares: fallbackShares,
            ticker: ticker ?? translate("history.timeline.portfolioFallback"),
          });
        case "DIVIDEND":
          return translate("history.timeline.dividend", {
            amount: amountLabel,
            ticker: ticker ?? translate("history.timeline.portfolioFallback"),
          });
        case "INTEREST":
          return translate("history.timeline.interest", { amount: amountLabel });
        case "FEE":
          return translate("history.timeline.fee", { amount: amountLabel });
        default:
          return null;
      }
    };

    const resolveTypeLabel = (type) => {
      if (typeof translate !== "function") {
        return type ?? "Activity";
      }
      const normalized = typeof type === "string" ? type.trim().toLowerCase() : "";
      if (!normalized) {
        return translate("history.timeline.activityLabel");
      }
      const key = `transactions.type.${normalized}`;
      const label = translate(key);
      return label === key ? type ?? translate("history.timeline.activityLabel") : label;
    };

    return [...transactions]
      .filter((transaction) => Boolean(parseMonthKey(transaction.date, locale)))
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 20)
      .map((transaction) => {
        const dateLabel = formatDateLabel(transaction.date);
        const typeLabel = resolveTypeLabel(transaction.type);
        const ticker =
          typeof transaction.ticker === "string" && transaction.ticker.trim().length > 0
            ? transaction.ticker.trim()
            : translate?.("history.timeline.portfolioFallback") ?? "Portfolio";
        return {
          date: transaction.date,
          dateLabel,
          typeLabel,
          title:
            typeof translate === "function"
              ? translate("history.timeline.itemTitle", {
                  name: ticker,
                  type: typeLabel,
                })
              : `${ticker} ${typeLabel}`,
          description: describeTransaction(transaction),
          transaction,
        };
      })
      .filter(Boolean);
}

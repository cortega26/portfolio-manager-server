export const BENCHMARK_SERIES_META = [
  {
    id: "spy",
    dataKey: "spy",
    label: "100% SPY benchmark",
    description: "Opportunity cost if fully invested in SPY",
    color: "#6366f1",
  },
  {
    id: "blended",
    dataKey: "blended",
    label: "Blended benchmark",
    description: "Risk-matched mix using start-of-day cash weights",
    color: "#f97316",
  },
  {
    id: "exCash",
    dataKey: "exCash",
    label: "Risk sleeve (ex-cash)",
    description: "Portfolio performance excluding the cash sleeve",
    color: "#ec4899",
  },
  {
    id: "cash",
    dataKey: "cash",
    label: "Cash yield",
    description: "Isolated cash performance with accrued interest",
    color: "#0ea5e9",
  },
];

const SERIES_SOURCE_KEYS = {
  portfolio: "r_port",
  spy: "r_spy_100",
  blended: "r_bench_blended",
  exCash: "r_ex_cash",
  cash: "r_cash",
};

const TYPE_ORDER = {
  DEPOSIT: 1,
  BUY: 2,
  SELL: 3,
  DIVIDEND: 4,
  INTEREST: 5,
  WITHDRAWAL: 6,
  FEE: 7,
};

const CASH_IN_TYPES = new Set(["DEPOSIT"]);
const CASH_OUT_TYPES = new Set(["WITHDRAWAL", "FEE"]);
const INCOME_TYPES = new Set(["DIVIDEND", "INTEREST"]);
const SHARE_TYPES = new Set(["BUY", "SELL"]);
const SHARE_EPSILON = 1e-8;

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

function normalizeTransaction(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const date = typeof raw.date === "string" ? raw.date.trim() : "";
  if (!date) {
    return null;
  }
  const type = String(raw.type ?? "").toUpperCase();
  const ticker = typeof raw.ticker === "string" ? raw.ticker.trim().toUpperCase() : "";
  const shares = Number.isFinite(raw.shares) ? Math.abs(Number(raw.shares)) : 0;
  const amount = Number.isFinite(raw.amount) ? Number(raw.amount) : 0;
  return {
    date,
    type,
    ticker,
    shares,
    amount,
    createdAt: raw.createdAt,
    seq: raw.seq,
    id: raw.id,
    uid: raw.uid,
  };
}

function sortTransactions(transactions) {
  return [...transactions].sort((a, b) => {
    const dateDiff = a.date.localeCompare(b.date);
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

function normalizePriceSeries(rawSeries) {
  if (!Array.isArray(rawSeries)) {
    return [];
  }
  const entries = [];
  for (const point of rawSeries) {
    const date = typeof point?.date === "string" ? point.date.trim() : "";
    if (!date) {
      continue;
    }
    const close = Number(point?.close ?? point?.price ?? 0);
    const safeClose = Number.isFinite(close) ? close : 0;
    entries.push({ date, close: safeClose });
  }
  entries.sort((a, b) => a.date.localeCompare(b.date));
  const deduped = [];
  for (const entry of entries) {
    const last = deduped[deduped.length - 1];
    if (last && last.date === entry.date) {
      deduped[deduped.length - 1] = entry;
    } else {
      deduped.push(entry);
    }
  }
  return deduped;
}

function createPriceCursor(rawSeries) {
  const series = normalizePriceSeries(rawSeries);
  let index = 0;
  let lastPrice = 0;
  return {
    advanceTo(date) {
      while (index < series.length && series[index].date <= date) {
        const candidate = Number(series[index].close);
        if (Number.isFinite(candidate)) {
          lastPrice = candidate;
        }
        index += 1;
      }
      return lastPrice;
    },
    peek() {
      return lastPrice;
    },
  };
}

function roundPercentage(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Number(value.toFixed(3));
}

function toNumeric(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 0;
  }
  return Math.round((number + Number.EPSILON) * 10_000) / 10_000;
}

export function mergeReturnSeries(series = {}) {
  const entriesByDate = new Map();

  for (const [targetKey, sourceKey] of Object.entries(SERIES_SOURCE_KEYS)) {
    const sourceSeries = Array.isArray(series?.[sourceKey])
      ? series[sourceKey]
      : [];
    for (const point of sourceSeries) {
      const date = point?.date;
      if (!date) {
        continue;
      }
      const normalized = entriesByDate.get(date) ?? { date };
      normalized[targetKey] = toNumeric(point?.value);
      entriesByDate.set(date, normalized);
    }
  }

  const sortedDates = Array.from(entriesByDate.keys()).sort((a, b) =>
    String(a).localeCompare(String(b)),
  );

  return sortedDates.map((date) => {
    const entry = entriesByDate.get(date) ?? { date };
    return {
      date,
      portfolio: toNumeric(entry.portfolio),
      spy: toNumeric(entry.spy),
      blended: toNumeric(entry.blended),
      exCash: toNumeric(entry.exCash),
      cash: toNumeric(entry.cash),
    };
  });
}

export async function buildRoiSeries(transactions, priceFetcher) {
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return [];
  }

  const normalizedTransactions = transactions
    .map((tx) => normalizeTransaction(tx))
    .filter(Boolean);

  if (normalizedTransactions.length === 0) {
    return [];
  }

  const tickers = [
    ...new Set(
      normalizedTransactions
        .filter((tx) => tx.ticker && SHARE_TYPES.has(tx.type))
        .map((tx) => tx.ticker),
    ),
  ];

  const symbols = [...tickers, "spy"];
  const priceMapEntries = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const result = await priceFetcher(symbol);
        if (Array.isArray(result)) {
          return [symbol.toUpperCase(), result];
        }
        if (result && Array.isArray(result.data)) {
          return [symbol.toUpperCase(), result.data];
        }
        return [symbol.toUpperCase(), []];
      } catch (error) {
        console.error(error);
        return [symbol.toUpperCase(), []];
      }
    }),
  );

  const priceMap = new Map(
    priceMapEntries.map(([symbol, series]) => [symbol, normalizePriceSeries(series)]),
  );

  const spySeries = priceMap.get("SPY") ?? priceMap.get("spy") ?? [];
  if (spySeries.length === 0) {
    return [];
  }

  const sortedTransactions = sortTransactions(normalizedTransactions);
  const priceCursors = new Map();
  for (const ticker of tickers) {
    priceCursors.set(ticker, createPriceCursor(priceMap.get(ticker) ?? []));
  }

  const holdings = new Map();
  for (const ticker of tickers) {
    holdings.set(ticker, 0);
  }

  let cashBalance = 0;
  let transactionIndex = 0;
  let previousNav = null;
  let cumulativeFactor = 1;
  let initialSpyPrice = null;

  const results = [];

  for (const point of spySeries) {
    const date = point.date;
    let flowForDate = 0;

    while (
      transactionIndex < sortedTransactions.length &&
      sortedTransactions[transactionIndex].date <= date
    ) {
      const tx = sortedTransactions[transactionIndex];
      transactionIndex += 1;
      const amount = Number.isFinite(tx.amount) ? tx.amount : 0;

      if (SHARE_TYPES.has(tx.type) && tx.ticker) {
        const previousShares = holdings.get(tx.ticker) ?? 0;
        const sharesDelta = tx.type === "BUY" ? tx.shares : -tx.shares;
        const nextShares = previousShares + sharesDelta;
        holdings.set(
          tx.ticker,
          Math.abs(nextShares) < SHARE_EPSILON ? 0 : nextShares,
        );
        const tradeCash = Math.abs(amount);
        if (tx.type === "BUY") {
          if (tradeCash > 0) {
            cashBalance -= tradeCash;
          }
          if (cashBalance < 0) {
            cashBalance = 0;
          }
        } else if (tx.type === "SELL" && tradeCash > 0) {
          cashBalance += tradeCash;
        }
        continue;
      }

      if (CASH_IN_TYPES.has(tx.type)) {
        const contribution = Math.abs(amount);
        if (contribution > 0) {
          cashBalance += contribution;
          flowForDate += contribution;
        }
        continue;
      }

      if (CASH_OUT_TYPES.has(tx.type)) {
        const withdrawal = Math.abs(amount);
        if (withdrawal > 0) {
          cashBalance -= withdrawal;
          flowForDate -= withdrawal;
        }
        if (cashBalance < 0) {
          cashBalance = 0;
        }
        continue;
      }

      if (INCOME_TYPES.has(tx.type)) {
        if (amount !== 0) {
          cashBalance += amount;
        }
        continue;
      }

      if (amount !== 0) {
        cashBalance += amount;
      }
    }

    let portfolioValue = cashBalance;
    for (const [ticker, shares] of holdings.entries()) {
      if (!Number.isFinite(shares) || Math.abs(shares) < SHARE_EPSILON) {
        continue;
      }
      const cursor = priceCursors.get(ticker);
      const price = cursor ? cursor.advanceTo(date) : 0;
      portfolioValue += shares * price;
    }

    if (Math.abs(portfolioValue) < SHARE_EPSILON) {
      portfolioValue = 0;
    }

    let periodReturn = 0;
    if (previousNav !== null && previousNav > 0) {
      periodReturn = (portfolioValue - flowForDate - previousNav) / previousNav;
    }

    if (!Number.isFinite(periodReturn)) {
      periodReturn = 0;
    }

    cumulativeFactor *= 1 + periodReturn;
    if (!Number.isFinite(cumulativeFactor) || cumulativeFactor <= 0) {
      cumulativeFactor = 1;
    }

    if (previousNav === null && portfolioValue > 0) {
      cumulativeFactor = 1;
    }

    const spyClose = Number.isFinite(point.close) ? Number(point.close) : 0;
    if (initialSpyPrice === null && spyClose > 0) {
      initialSpyPrice = spyClose;
    }
    const spyBaseline = initialSpyPrice ?? spyClose;
    const spyReturn =
      spyBaseline && spyBaseline !== 0
        ? ((spyClose - spyBaseline) / spyBaseline) * 100
        : 0;

    results.push({
      date,
      portfolio: roundPercentage((cumulativeFactor - 1) * 100),
      spy: roundPercentage(spyReturn),
    });

    previousNav = portfolioValue;
  }

  return results;
}

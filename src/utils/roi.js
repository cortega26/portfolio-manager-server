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

function findClosestPrice(series, targetDate) {
  if (!Array.isArray(series) || series.length === 0) {
    return 0;
  }

  let previous = series[0].close ?? 0;
  for (const point of series) {
    if (point.date === targetDate) {
      return point.close ?? previous;
    }

    if (point.date > targetDate) {
      return previous;
    }

    previous = point.close ?? previous;
  }

  return previous;
}

export async function buildRoiSeries(transactions, priceFetcher) {
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return [];
  }

  const tickers = [...new Set(transactions.map((tx) => tx.ticker))];
  const symbols = [...tickers, "spy"];
  const priceMapEntries = await Promise.all(
    symbols.map(async (symbol) => {
      const result = await priceFetcher(symbol);
      if (Array.isArray(result)) {
        return [symbol, result];
      }
      if (result && Array.isArray(result.data)) {
        return [symbol, result.data];
      }
      return [symbol, []];
    }),
  );
  const priceMap = Object.fromEntries(priceMapEntries);
  const spySeries = priceMap.spy ?? [];
  if (spySeries.length === 0) {
    return [];
  }

  const cumulativeShares = Object.fromEntries(
    tickers.map((ticker) => [ticker, 0]),
  );
  let initialValue = null;
  const initialSpyPrice = spySeries[0].close ?? 0;

  return spySeries.map((point) => {
    const date = point.date;
    transactions
      .filter((tx) => tx.date === date)
      .forEach((tx) => {
        if (tx.type === "BUY") {
          cumulativeShares[tx.ticker] += tx.shares;
        } else if (tx.type === "SELL") {
          cumulativeShares[tx.ticker] -= tx.shares;
        }
      });

    const portfolioValue = tickers.reduce((total, ticker) => {
      const price = findClosestPrice(priceMap[ticker], date);
      return total + cumulativeShares[ticker] * price;
    }, 0);

    if (initialValue === null) {
      initialValue = portfolioValue;
    }

    const portfolioRoi =
      initialValue === 0
        ? 0
        : ((portfolioValue - initialValue) / initialValue) * 100;
    const spyPrice = point.close ?? initialSpyPrice;
    const spyRoi =
      initialSpyPrice === 0
        ? 0
        : ((spyPrice - initialSpyPrice) / initialSpyPrice) * 100;

    return {
      date,
      portfolio: Number(portfolioRoi.toFixed(3)),
      spy: Number(spyRoi.toFixed(3)),
      blended: 0,
      exCash: 0,
      cash: 0,
    };
  });
}

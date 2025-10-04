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
      const data = await priceFetcher(symbol);
      return [symbol, data];
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
    };
  });
}

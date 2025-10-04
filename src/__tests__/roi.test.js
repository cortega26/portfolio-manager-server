import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { buildRoiSeries } from "../utils/roi.js";

const transactions = [
  { date: "2024-01-01", ticker: "AAPL", type: "BUY", shares: 1, amount: -100 },
  { date: "2024-01-02", ticker: "AAPL", type: "BUY", shares: 1, amount: -110 },
];

const priceMap = {
  AAPL: [
    { date: "2024-01-01", close: 100 },
    { date: "2024-01-02", close: 120 },
    { date: "2024-01-03", close: 140 },
  ],
  SPY: [
    { date: "2024-01-01", close: 200 },
    { date: "2024-01-02", close: 210 },
    { date: "2024-01-03", close: 220 },
  ],
};

describe("ROI utilities", () => {
  it("builds ROI series relative to SPY", async () => {
    const fetcher = async (symbol) => priceMap[symbol.toUpperCase()];
    const series = await buildRoiSeries(transactions, fetcher);

    assert.equal(series.length, 3);
    assert.equal(series[0].portfolio, 0);
    assert.ok(series[2].portfolio > 0);
    assert.equal(series[0].spy, 0);
  });

  it("returns an empty series when transactions are missing", async () => {
    const fetcher = async () => priceMap.AAPL;
    const series = await buildRoiSeries([], fetcher);
    assert.deepEqual(series, []);
  });

  it("returns an empty series when SPY data is unavailable", async () => {
    const fetcher = async (symbol) => (symbol === "spy" ? [] : priceMap.AAPL);
    const series = await buildRoiSeries(transactions, fetcher);
    assert.deepEqual(series, []);
  });

  it("falls back to the previous close when a ticker lacks data for a date", async () => {
    const extendedTransactions = [
      ...transactions,
      {
        date: "2024-01-03",
        ticker: "AAPL",
        type: "SELL",
        shares: 1,
        amount: 130,
      },
    ];
    const fetcher = async (symbol) => {
      if (symbol.toUpperCase() === "AAPL") {
        return [
          { date: "2024-01-01", close: 100 },
          { date: "2024-01-03", close: 140 },
        ];
      }

      return priceMap.SPY;
    };

    const series = await buildRoiSeries(extendedTransactions, fetcher);
    assert.equal(series.length, 3);
    assert.ok(series[1].portfolio >= 0);
  });

  it("uses zero pricing when a ticker series is empty", async () => {
    const fetcher = async (symbol) =>
      symbol.toUpperCase() === "AAPL" ? [] : priceMap.SPY;
    const series = await buildRoiSeries(transactions, fetcher);
    assert.equal(series.length, 3);
    assert.equal(series[1].portfolio, 0);
  });
});

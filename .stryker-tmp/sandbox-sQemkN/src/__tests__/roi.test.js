// @ts-nocheck
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { buildRoiSeries, mergeReturnSeries } from "../utils/roi.js";

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
  it("merges API return series into chart-friendly rows", () => {
    const merged = mergeReturnSeries({
      r_port: [
        { date: "2024-01-01", value: 0 },
        { date: "2024-01-02", value: 1.23456 },
      ],
      r_spy_100: [
        { date: "2024-01-01", value: 0.5 },
        { date: "2024-01-02", value: 1.11119 },
      ],
      r_bench_blended: [
        { date: "2024-01-01", value: 0.25 },
        { date: "2024-01-02", value: 0.98765 },
      ],
      r_ex_cash: [{ date: "2024-01-02", value: 1.55555 }],
      r_cash: [{ date: "2024-01-01", value: 0.02 }],
    });

    assert.deepEqual(merged, [
      {
        date: "2024-01-01",
        portfolio: 0,
        spy: 0.5,
        blended: 0.25,
        exCash: 0,
        cash: 0.02,
      },
      {
        date: "2024-01-02",
        portfolio: 1.2346,
        spy: 1.1112,
        blended: 0.9877,
        exCash: 1.5556,
        cash: 0,
      },
    ]);
  });

  it("guards against malformed API payloads", () => {
    const merged = mergeReturnSeries({ r_port: [{ date: "2024-01-01" }] });
    assert.deepEqual(merged, [
      {
        date: "2024-01-01",
        portfolio: 0,
        spy: 0,
        blended: 0,
        exCash: 0,
        cash: 0,
      },
    ]);
  });

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

  it("omits benchmark-only series when falling back to local ROI", async () => {
    const fetcher = async (symbol) => {
      const upper = symbol.toUpperCase();
      if (upper === "AAPL") {
        return priceMap.AAPL;
      }
      if (upper === "SPY") {
        return priceMap.SPY;
      }
      return [];
    };

    const series = await buildRoiSeries(transactions, fetcher);
    assert.ok(series.length > 0);
    for (const point of series) {
      assert.equal("portfolio" in point, true);
      assert.equal("spy" in point, true);
      assert.equal("blended" in point, false);
      assert.equal("exCash" in point, false);
      assert.equal("cash" in point, false);
    }
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

  it("accounts for deposits and dividends when computing fallback ROI", async () => {
    const scenarioTransactions = [
      { date: "2024-01-01", type: "DEPOSIT", amount: 1000 },
      {
        date: "2024-01-01",
        ticker: "AAPL",
        type: "BUY",
        shares: 5,
        amount: -500,
      },
      { date: "2024-01-02", type: "DIVIDEND", amount: 10 },
    ];
    const fetcher = async (symbol) => priceMap[symbol.toUpperCase()];

    const series = await buildRoiSeries(scenarioTransactions, fetcher);

    assert.equal(series.length, 3);
    assert.equal(series[0].portfolio, 0);
    const secondDay = series.find((point) => point.date === "2024-01-02");
    assert.ok(secondDay);
    assert.equal(secondDay.portfolio, 11);
  });

  it("parses numeric transaction fields provided as strings", async () => {
    const stringTransactions = [
      { date: "2024-01-01", type: "DEPOSIT", amount: "1000" },
      {
        date: "2024-01-02",
        ticker: "AAPL",
        type: "BUY",
        shares: "1",
        amount: "-500",
      },
      {
        date: "2024-01-03",
        ticker: "AAPL",
        type: "BUY",
        shares: "1",
        amount: "-500",
      },
      { date: "2024-01-04", type: "DIVIDEND", amount: "10" },
    ];

    const fetcher = async (symbol) => priceMap[symbol.toUpperCase()];

    const series = await buildRoiSeries(stringTransactions, fetcher);

    const lastPoint = series.at(-1);
    assert.ok(lastPoint);
    assert.ok(lastPoint.portfolio > 0);
  });

  it("treats withdrawals as external cash flows without fabricating losses", async () => {
    const withdrawalScenario = [
      { date: "2024-01-01", type: "DEPOSIT", amount: 1000 },
      {
        date: "2024-01-01",
        ticker: "AAPL",
        type: "BUY",
        shares: 5,
        amount: -500,
      },
      { date: "2024-01-02", type: "WITHDRAWAL", amount: 500 },
    ];

    const fetcher = async (symbol) => priceMap[symbol.toUpperCase()];
    const series = await buildRoiSeries(withdrawalScenario, fetcher);

    const secondDay = series.find((point) => point.date === "2024-01-02");
    assert.ok(secondDay);
    assert.equal(secondDay.portfolio, 5);
  });

  it("aligns weekend cash flows with the next available trading date", async () => {
    const weekendTransactions = [
      { date: "2024-01-06", type: "DEPOSIT", amount: 1000 },
    ];
    const spyOnlyFetcher = async (symbol) => {
      const upper = symbol.toUpperCase();
      if (upper === "SPY") {
        return [
          { date: "2024-01-05", close: 200 },
          { date: "2024-01-08", close: 200 },
        ];
      }
      return [];
    };

    const series = await buildRoiSeries(weekendTransactions, spyOnlyFetcher);

    assert.deepEqual(
      series,
      [
        { date: "2024-01-05", portfolio: 0, spy: 0 },
        { date: "2024-01-08", portfolio: 0, spy: 0 },
      ],
    );
  });

  it("skips price fetches for transactions without tickers", async () => {
    const calls = [];
    const mixedTransactions = [
      ...transactions,
      { date: "2024-01-03", type: "DEPOSIT", amount: 500 },
      { date: "2024-01-04", ticker: " ", type: "BUY", shares: 2, amount: -240 },
    ];
    const fetcher = async (symbol) => {
      calls.push(symbol);
      const upper = symbol?.toUpperCase();
      if (upper === "AAPL") {
        return priceMap.AAPL;
      }
      if (upper === "SPY") {
        return priceMap.SPY;
      }
      return [];
    };

    await buildRoiSeries(mixedTransactions, fetcher);

    assert.deepEqual(
      calls.filter((symbol) => typeof symbol !== "string" || symbol.trim().length === 0),
      [],
    );
    assert.deepEqual(new Set(calls.map((symbol) => symbol.toUpperCase())), new Set(["AAPL", "SPY"]));
  });
});

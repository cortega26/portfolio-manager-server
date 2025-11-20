// @ts-nocheck
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  buildHoldings,
  buildHoldingsState,
  computeDashboardMetrics,
  deriveHoldingStats,
  deriveSignalRow,
} from "../utils/holdings.js";

const transactions = [
  { ticker: "AAPL", type: "BUY", shares: 5, amount: -500 },
  { ticker: "AAPL", type: "BUY", shares: 5, amount: -600 },
  { ticker: "AAPL", type: "SELL", shares: 3, amount: 450 },
  { ticker: "MSFT", type: "BUY", shares: 2, amount: -400 },
];

describe("holdings utilities", () => {
  it("builds aggregate holdings with realised gains", () => {
    const holdings = buildHoldings(transactions);
    assert.equal(holdings.length, 2);

    const apple = holdings.find((item) => item.ticker === "AAPL");
    assert.ok(apple);
    assert.equal(Number(apple.shares.toFixed(2)), 7);
    assert.ok(apple.realised > 0);
  });

  it("derives holding stats and signal rows", () => {
    const holdings = buildHoldings(transactions);
    const apple = holdings.find((item) => item.ticker === "AAPL");
    const stats = deriveHoldingStats(apple, 130);

    assert.equal(stats.value, 910);
    assert.equal(stats.avgCostLabel, "$110.00");

    const signal = deriveSignalRow(apple, 130, 5);
    assert.equal(signal.lower, "$123.50");
    assert.equal(signal.signal, "HOLD");
  });

  it("computes dashboard metrics", () => {
    const holdings = buildHoldings(transactions);
    const metrics = computeDashboardMetrics(holdings, { AAPL: 130, MSFT: 210 });

    assert.equal(Math.round(metrics.totalValue), 1330);
    assert.equal(metrics.holdingsCount, 2);
  });

  it("handles missing tickers and unavailable prices gracefully", () => {
    const holdings = buildHoldings([
      { ticker: "", type: "BUY", shares: 1, amount: -10 },
      { ticker: "NFLX", type: "BUY", shares: 2, amount: -200 },
    ]);

    assert.equal(holdings.length, 1);
    const signal = deriveSignalRow(holdings[0], undefined, 4);
    assert.equal(signal.signal, "NO DATA");
    assert.equal(signal.price, "—");
  });

  it("reports oversell warnings via the onWarning callback", () => {
    const oversellTransactions = [
      { ticker: "TSLA", type: "BUY", shares: 10, amount: -2000, date: "2024-01-01" },
      { ticker: "TSLA", type: "SELL", shares: 15, amount: 3500, date: "2024-01-02" },
    ];

    const events = [];
    const state = buildHoldingsState(oversellTransactions, {
      logSummary: true,
      onWarning: (event) => {
        events.push(event);
      },
    });

    assert.equal(state.warnings.length, 1);
    assert.equal(events.length, 2);

    const oversellEvent = events.find((event) => event.type === "oversell");
    assert.ok(oversellEvent, "expected oversell event to be emitted");
    assert.equal(oversellEvent.warning.ticker, "TSLA");
    assert.equal(oversellEvent.warning.clipped, 10);
    assert.match(oversellEvent.message, /Cannot sell 15/);

    const summaryEvent = events.find((event) => event.type === "summary");
    assert.ok(summaryEvent, "expected summary event to be emitted");
    assert.equal(summaryEvent.count, 1);
    assert.equal(summaryEvent.warnings.length, 1);
  });
});

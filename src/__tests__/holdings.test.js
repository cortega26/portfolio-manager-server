import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  buildHoldings,
  buildHoldingsState,
  computeDashboardMetrics,
  deriveHoldingStats,
  deriveSignalRow,
  filterOpenHoldings,
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
    assert.equal(apple.shares, "7.000000000");
    assert.ok(apple.realised > 0);
  });

  it("derives holding stats and signal rows", () => {
    const holdings = buildHoldings(transactions);
    const apple = holdings.find((item) => item.ticker === "AAPL");
    const stats = deriveHoldingStats(apple, 130);

    assert.equal(stats.value, 910);
    assert.equal(stats.avgCostLabel, "$110.00");

    const signal = deriveSignalRow(apple, 130, 5, { price: 150, date: "2024-01-03", type: "SELL" });
    assert.equal(signal.price, "$130.00");
    assert.equal(signal.lower, "$142.50");
    assert.equal(signal.upper, "$157.50");
    assert.equal(signal.signal, "BUY zone");
    assert.equal(signal.referencePrice, 150);
    assert.equal(signal.referenceType, "SELL");
  });

  it("computes dashboard metrics", () => {
    const holdings = buildHoldings(transactions);
    const metrics = computeDashboardMetrics(holdings, { AAPL: 130, MSFT: 210 });

    assert.equal(Math.round(metrics.totalValue), 1330);
    assert.equal(metrics.holdingsCount, 2);
    assert.equal(metrics.pricedHoldingsCount, 2);
    assert.equal(metrics.unpricedHoldingsCount, 0);
  });

  it("does not fall back to cost basis when market prices are unavailable", () => {
    const holdings = buildHoldings(transactions);
    const metrics = computeDashboardMetrics(holdings, {});

    assert.equal(Math.round(metrics.totalValue), 0);
    assert.equal(Math.round(metrics.totalCost), 1170);
    assert.equal(metrics.pricedHoldingsCount, 0);
    assert.equal(metrics.unpricedHoldingsCount, 2);
  });

  it("handles missing tickers and unavailable prices gracefully", () => {
    const holdings = buildHoldings([
      { ticker: "", type: "BUY", shares: 1, amount: -10 },
      { ticker: "NFLX", type: "BUY", shares: 2, amount: -200 },
    ]);

    assert.equal(holdings.length, 1);
    const stats = deriveHoldingStats(holdings[0], undefined);
    assert.equal(stats.priceLabel, "—");
    assert.equal(stats.valueLabel, "—");
    const signal = deriveSignalRow(holdings[0], undefined, 4);
    assert.equal(signal.signal, "NO DATA");
    assert.equal(signal.price, "—");
  });

  it("filters closed positions out of the open-holdings view", () => {
    const holdings = buildHoldings([
      { ticker: "AAPL", type: "BUY", shares: 1, amount: -100 },
      { ticker: "AAPL", type: "SELL", shares: 1, amount: 120 },
      { ticker: "MSFT", type: "BUY", shares: 2, amount: -400 },
    ]);

    const openHoldings = filterOpenHoldings(holdings);

    assert.equal(holdings.length, 2);
    assert.equal(openHoldings.length, 1);
    assert.equal(openHoldings[0].ticker, "MSFT");
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

  it("preserves valuation cents from current prices instead of introducing share-rounding drift", () => {
    const holdings = [
      { ticker: "TSLA", shares: "0.783956628", cost: 329.2326079731601, realised: 99.52260797316008 },
      { ticker: "AMD", shares: "0.305562260", cost: 71.22907018510486, realised: 77.66907018510486 },
      { ticker: "DELL", shares: "0.454749913", cost: 59.96570220624224, realised: 64.55570220624224 },
      { ticker: "GLD", shares: "0.001016562", cost: 0.373966731138057, realised: 5.533966731138057 },
    ];

    const tslaStats = deriveHoldingStats(holdings[0], 392.79);
    const amdStats = deriveHoldingStats(holdings[1], 199.43);
    const dellStats = deriveHoldingStats(holdings[2], 149.21);
    const gldStats = deriveHoldingStats(holdings[3], 444.74);

    assert.equal(tslaStats.valueLabel, "$307.93");
    assert.equal(amdStats.valueLabel, "$60.94");
    assert.equal(dellStats.valueLabel, "$67.85");
    assert.equal(gldStats.valueLabel, "$0.45");
  });
});

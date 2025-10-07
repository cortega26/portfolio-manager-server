import assert from "node:assert/strict";
import { test } from "node:test";

import fc from "fast-check";

import { buildRoiSeries } from "../utils/roi.js";

const START_DATE = new Date("2024-01-01T00:00:00Z");

function dayString(offset) {
  const date = new Date(START_DATE);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

const dailyScenarioArb = fc.array(
  fc.record({
    price: fc.double({ min: 5, max: 600, noNaN: true }),
    spy: fc.double({ min: 5, max: 600, noNaN: true }),
  }),
  { minLength: 3, maxLength: 9 },
);
const initialShareArb = fc.double({ min: 0.1, max: 20, noNaN: true });

function toSeries(days, key) {
  return days.map((entry, index) => ({
    date: dayString(index),
    close: Number.parseFloat(entry[key].toFixed(4)),
  }));
}

function buildFetcher(seriesMap) {
  return async (symbol) => {
    const normalized = symbol.toUpperCase();
    if (normalized in seriesMap) {
      return seriesMap[normalized];
    }
    if (symbol === "spy" && seriesMap.SPY) {
      return seriesMap.SPY;
    }
    throw new Error(`Unexpected symbol ${symbol}`);
  };
}

test("ROI remains invariant when scaling position sizes", async () => {
  await fc.assert(
    fc.asyncProperty(
      dailyScenarioArb,
      initialShareArb,
      fc.double({ min: 0.5, max: 12, noNaN: true }),
      async (days, baseShare, factor) => {
        const equitySeries = toSeries(days, "price");
        const spySeries = toSeries(days, "spy");
        const normalizedShare = Number.parseFloat(baseShare.toFixed(6));
        const baseTransactions = [
          {
            date: dayString(0),
            ticker: "ACME",
            type: "BUY",
            shares: normalizedShare,
            amount: -Number.parseFloat((normalizedShare * days[0].price).toFixed(2)),
          },
        ];
        const scaledTransactions = [
          {
            ...baseTransactions[0],
            shares: Number.parseFloat((normalizedShare * factor).toFixed(6)),
            amount: Number.parseFloat((baseTransactions[0].amount * factor).toFixed(2)),
          },
        ];

        const fetcher = buildFetcher({ ACME: equitySeries, SPY: spySeries });
        const baseline = await buildRoiSeries(baseTransactions, fetcher);
        const scaled = await buildRoiSeries(scaledTransactions, fetcher);

        assert.equal(baseline.length, scaled.length);
        for (let i = 0; i < baseline.length; i += 1) {
          const delta = Math.abs(baseline[i].portfolio - scaled[i].portfolio);
          assert.ok(
            delta <= 0.003,
            `Expected ROI invariance at index ${i}, delta=${delta}`,
          );
          assert.equal(baseline[i].spy, scaled[i].spy);
        }
      },
    ),
  );
});

test("SPY-only portfolios track the SPY benchmark", async () => {
  await fc.assert(
    fc.asyncProperty(dailyScenarioArb, initialShareArb, async (days, share) => {
      const spySeries = toSeries(days, "spy");
      const normalizedShare = Number.parseFloat(share.toFixed(6));
      const transactions = [
        {
          date: dayString(0),
          ticker: "SPY",
          type: "BUY",
          shares: normalizedShare,
          amount: -Number.parseFloat((normalizedShare * days[0].spy).toFixed(2)),
        },
      ];

      const fetcher = buildFetcher({ SPY: spySeries });
      const roiSeries = await buildRoiSeries(transactions, fetcher);
      assert.equal(roiSeries.length, spySeries.length);
      for (let i = 0; i < roiSeries.length; i += 1) {
        const delta = Math.abs(roiSeries[i].portfolio - roiSeries[i].spy);
        assert.ok(delta <= 0.0015, `SPY parity drift at index ${i}: ${delta}`);
      }
    }),
  );
});

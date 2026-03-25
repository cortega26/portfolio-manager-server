import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  deriveLastSignalReference,
  evaluateSignalRow,
  resolveSignalWindow,
  SIGNAL_STATUS,
} from "../signals.js";

describe("shared signal engine", () => {
  it("uses the latest BUY or SELL as the reference price", () => {
    const reference = deriveLastSignalReference(
      [
        { ticker: "AAPL", type: "BUY", shares: 5, amount: -500, price: 100, date: "2024-01-01" },
        { ticker: "AAPL", type: "SELL", shares: 2, amount: 230, price: 115, date: "2024-01-05" },
        { ticker: "AAPL", type: "BUY", shares: 1, amount: -120, price: 120, date: "2024-01-06" },
      ],
      "aapl",
    );

    assert.deepEqual(reference, {
      ticker: "AAPL",
      price: 120,
      date: "2024-01-06",
      type: "BUY",
    });
  });

  it("falls back to the default 3 percent window when no signal config exists", () => {
    assert.equal(resolveSignalWindow({}, "NVDA"), 3);
    assert.equal(resolveSignalWindow({ nvda: { percent: "5.5" } }, "NVDA"), 5.5);
  });

  it("rejects suspicious prices outside the sanity band", () => {
    const row = evaluateSignalRow({
      ticker: "NVDA",
      pctWindow: 5,
      currentPrice: 140,
      reference: { price: 100, date: "2024-01-01", type: "BUY" },
    });

    assert.equal(row.status, SIGNAL_STATUS.NO_DATA);
    assert.equal(row.sanityRejected, true);
    assert.equal(row.lowerBound, null);
    assert.equal(row.upperBound, null);
  });

  it("returns NO_DATA when the current price or reference is unavailable", () => {
    const missingPrice = evaluateSignalRow({
      ticker: "MSFT",
      pctWindow: 4,
      currentPrice: null,
      reference: { price: 100, date: "2024-01-01", type: "BUY" },
    });
    assert.equal(missingPrice.status, SIGNAL_STATUS.NO_DATA);

    const missingReference = evaluateSignalRow({
      ticker: "MSFT",
      pctWindow: 4,
      currentPrice: 100,
      reference: null,
    });
    assert.equal(missingReference.status, SIGNAL_STATUS.NO_DATA);
  });
});

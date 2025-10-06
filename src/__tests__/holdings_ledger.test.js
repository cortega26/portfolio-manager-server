import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildHoldings } from "../utils/holdings.js";
import {
  buildLedgerFromTransactions,
  createInitialLedgerState,
  ledgerReducer,
} from "../utils/holdingsLedger.js";

const SAMPLE_TRANSACTIONS = [
  { ticker: "AAPL", type: "BUY", shares: 5, amount: -500, date: "2024-01-02" },
  { ticker: "AAPL", type: "BUY", shares: 3, amount: -360, date: "2024-01-05" },
  { ticker: "AAPL", type: "SELL", shares: 4, amount: 460, date: "2024-01-10" },
  { ticker: "MSFT", type: "BUY", shares: 2, amount: -420, date: "2024-01-12" },
];

describe("holdings ledger reducer", () => {
  it("builds ledger state equivalent to full holdings rebuild", () => {
    const ledger = buildLedgerFromTransactions(SAMPLE_TRANSACTIONS, { logSummary: false });
    const expectedHoldings = buildHoldings(SAMPLE_TRANSACTIONS);

    assert.equal(ledger.transactions.length, SAMPLE_TRANSACTIONS.length);
    assert.equal(ledger.history.length, SAMPLE_TRANSACTIONS.length);
    assert.deepEqual(ledger.holdings, expectedHoldings);
  });

  it("appends transactions incrementally", () => {
    const seedTransactions = SAMPLE_TRANSACTIONS.slice(0, 2);
    let state = buildLedgerFromTransactions(seedTransactions, { logSummary: false });

    state = ledgerReducer(state, {
      type: "append",
      transaction: SAMPLE_TRANSACTIONS[2],
    });

    const expectedHoldings = buildHoldings(SAMPLE_TRANSACTIONS.slice(0, 3));
    assert.deepEqual(state.holdings, expectedHoldings);
    assert.equal(state.transactions.length, 3);
  });

  it("removes the most recent transaction using history snapshots", () => {
    let state = buildLedgerFromTransactions(SAMPLE_TRANSACTIONS, { logSummary: false });

    state = ledgerReducer(state, {
      type: "remove",
      index: SAMPLE_TRANSACTIONS.length - 1,
    });

    const expectedTransactions = SAMPLE_TRANSACTIONS.slice(0, -1);
    const expectedHoldings = buildHoldings(expectedTransactions);

    assert.deepEqual(state.holdings, expectedHoldings);
    assert.equal(state.transactions.length, expectedTransactions.length);
  });

  it("rebuilds when removing non-terminal transactions", () => {
    let state = buildLedgerFromTransactions(SAMPLE_TRANSACTIONS, { logSummary: false });

    state = ledgerReducer(state, {
      type: "remove",
      index: 1,
    });

    const expectedTransactions = SAMPLE_TRANSACTIONS.filter((_, idx) => idx !== 1);
    const expectedHoldings = buildHoldings(expectedTransactions);

    assert.deepEqual(state.holdings, expectedHoldings);
  });

  it("returns the initial state when reducer is seeded", () => {
    const initialState = createInitialLedgerState();
    assert.deepEqual(initialState.transactions, []);
    assert.deepEqual(initialState.holdings, []);
    assert.deepEqual(initialState.history, []);
  });
});


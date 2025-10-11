import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  loadActivePortfolioSnapshot,
  persistActivePortfolioSnapshot,
  setActivePortfolioId,
} from "../state/portfolioStore.js";

function createMockStorage() {
  let data = {};
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
    removeItem(key) {
      delete data[key];
    },
    clear() {
      data = {};
    },
  };
}

describe("portfolioStore", () => {
  let storage;

  beforeEach(() => {
    storage = createMockStorage();
  });

  it("persists and loads the active snapshot", () => {
    const transactions = [{ id: "tx-1", amount: 100 }];
    const signals = { AAPL: { pct: 5 } };
    const settings = { theme: "dark" };

    const persisted = persistActivePortfolioSnapshot(
      {
        id: "demo",
        name: "demo",
        transactions,
        signals,
        settings,
      },
      storage,
    );

    assert.equal(persisted, true);

    transactions[0].amount = 200; // mutate original to ensure deep clone
    signals.AAPL.pct = 10;
    settings.theme = "light";

    const snapshot = loadActivePortfolioSnapshot(storage);
    assert.equal(snapshot.id, "demo");
    assert.deepEqual(snapshot.transactions, [{ id: "tx-1", amount: 100 }]);
    assert.equal(snapshot.signals.AAPL.pct, 5);
    assert.equal(snapshot.settings.theme, "dark");
  });

  it("allows clearing the active portfolio id", () => {
    persistActivePortfolioSnapshot(
      {
        id: "demo",
        transactions: [],
      },
      storage,
    );

    setActivePortfolioId(null, storage);

    const snapshot = loadActivePortfolioSnapshot(storage);
    assert.equal(snapshot, null);
  });

  it("returns false when no storage is available", () => {
    assert.equal(persistActivePortfolioSnapshot({ id: "demo" }), false);
    assert.equal(loadActivePortfolioSnapshot(), null);
  });

  it("throws when snapshot id is missing", () => {
    assert.throws(() => persistActivePortfolioSnapshot({ transactions: [] }, storage));
  });
});


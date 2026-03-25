import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  loadActivePortfolioId,
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
  };
}

describe("portfolioStore", () => {
  let storage;

  beforeEach(() => {
    storage = createMockStorage();
  });

  it("persists and loads only the active portfolio id", () => {
    const persisted = setActivePortfolioId("demo", storage);

    assert.equal(persisted, true);
    assert.equal(loadActivePortfolioId(storage), "demo");
  });

  it("allows clearing the active portfolio id", () => {
    setActivePortfolioId("demo", storage);
    setActivePortfolioId(null, storage);

    assert.equal(loadActivePortfolioId(storage), null);
  });

  it("returns false when no storage is available for writes", () => {
    assert.equal(setActivePortfolioId("demo"), false);
    assert.equal(loadActivePortfolioId(), null);
  });

  it("can read the active id from the legacy snapshot-shaped payload", () => {
    storage.setItem(
      "portfolio-manager-active-portfolio",
      JSON.stringify({
        activeId: "legacy",
        snapshots: {
          legacy: { id: "legacy", transactions: [{ id: "tx-1" }] },
        },
      }),
    );

    assert.equal(loadActivePortfolioId(storage), "legacy");
  });
});


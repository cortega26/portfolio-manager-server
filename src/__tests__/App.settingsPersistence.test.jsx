import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import App from "../App.jsx";

const persistCalls = [];
let retrieveResponse = {
  data: { transactions: [], signals: {}, settings: null },
  requestId: "retrieve-initial",
};

vi.mock("../utils/api.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    __esModule: true,
    fetchPrices: vi.fn(async () => ({ data: [], requestId: "price-none" })),
    fetchDailyReturns: vi.fn(async () => ({
      data: { series: { port: [], spy: [] } },
      requestId: "returns-none",
    })),
    persistPortfolio: vi.fn(async (_id, body) => {
      persistCalls.push(body);
      return { requestId: "persist-123" };
    }),
    retrievePortfolio: vi.fn(async () => retrieveResponse),
  };
});

const api = await import("../utils/api.js");

export function __setRetrieveResponse(next) {
  retrieveResponse = next;
}

export function __resetPersistCalls() {
  persistCalls.length = 0;
}

export function __getPersistCalls() {
  return persistCalls.slice();
}

describe("App portfolio settings persistence", () => {
  let dom;

  beforeEach(() => {
    __resetPersistCalls();
    __setRetrieveResponse({
      data: { transactions: [], signals: {}, settings: null },
      requestId: "retrieve-initial",
    });
    dom = new JSDOM("<!doctype html><html><body></body></html>", {
      url: "http://localhost/",
    });
    global.window = dom.window;
    global.document = dom.window.document;
    global.navigator = dom.window.navigator;
    global.HTMLElement = dom.window.HTMLElement;
    global.Node = dom.window.Node;
    global.localStorage = dom.window.localStorage;
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  afterEach(() => {
    cleanup();
    dom.window.close();
    delete global.window;
    delete global.document;
    delete global.navigator;
    delete global.HTMLElement;
    delete global.Node;
    delete global.localStorage;
    delete global.ResizeObserver;
  });

  it("saves preferences with the portfolio payload and hydrates them on load", async () => {
    render(<App />);

    await userEvent.type(screen.getByLabelText(/Portfolio ID/i), "client-123");
    await userEvent.type(screen.getByLabelText(/API Key/i), "ClientKey2024!Strong");

    await userEvent.click(screen.getByRole("button", { name: /settings/i }));

    const maskBalances = screen.getByLabelText(/Mask balances by default/i);
    const compactTables = screen.getByLabelText(/Compact table spacing/i);
    const rebalanceReminders = screen.getByLabelText(/Monthly rebalance reminders/i);
    const currencySelect = screen.getByLabelText(/Display currency/i);
    const autoClipToggle = screen.getByLabelText(/Auto-clip oversell orders/i);

    await userEvent.click(maskBalances);
    await userEvent.click(compactTables);
    await userEvent.click(rebalanceReminders);
    await userEvent.selectOptions(currencySelect, "EUR");
    await userEvent.click(autoClipToggle);

    await userEvent.click(screen.getByRole("button", { name: /save portfolio/i }));

    await waitFor(() => {
      assert.equal(__getPersistCalls().length, 1);
    });

    const payload = __getPersistCalls().at(-1);
    assert.equal(payload.settings.autoClip, true);
    assert.equal(payload.settings.display.currency, "EUR");
    assert.equal(payload.settings.display.compactTables, true);
    assert.equal(payload.settings.privacy.hideBalances, true);
    assert.equal(payload.settings.alerts.rebalance, false);

    __setRetrieveResponse({
      data: {
        transactions: [],
        signals: {},
        settings: {
          autoClip: false,
          display: { currency: "GBP", compactTables: false, refreshInterval: 10 },
          privacy: { hideBalances: false },
          alerts: { rebalance: true, drawdownThreshold: 12 },
          notifications: { email: true, push: false },
        },
      },
      requestId: "retrieve-portfolio",
    });

    await userEvent.click(screen.getByRole("button", { name: /load portfolio/i }));

    await waitFor(() => {
      assert.equal(api.retrievePortfolio.mock.calls.length, 1);
      assert.equal(maskBalances.checked, false);
      assert.equal(compactTables.checked, false);
      assert.equal(rebalanceReminders.checked, true);
      assert.equal(currencySelect.value, "GBP");
      assert.equal(autoClipToggle.checked, false);
    });
  });
});

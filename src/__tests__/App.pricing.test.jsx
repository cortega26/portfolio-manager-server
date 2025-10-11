import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import App from "../App.jsx";

vi.mock("../utils/api.js", async (importOriginal) => {
  const actual = await importOriginal();
  const priceCalls = [];
  let shouldFailNextPrice = false;

  return {
    ...actual,
    __esModule: true,
    fetchPrices: vi.fn(async (ticker) => {
      if (shouldFailNextPrice) {
        const error = new Error("Pricing temporarily unavailable");
        error.name = "ApiError";
        error.requestId = "price-fail-001";
        shouldFailNextPrice = false;
        throw error;
      }
      priceCalls.push(ticker);
      return {
        data: [
          { date: "2024-01-01", close: 120 },
          { date: "2024-01-02", close: 125 },
        ],
        requestId: "price-success-001",
      };
    }),
    fetchDailyReturns: vi.fn(async () => ({
      data: {
        series: {
          port: [
            { date: "2024-01-01", value: 0 },
            { date: "2024-01-02", value: 0.01 },
          ],
          spy: [],
        },
      },
      requestId: "returns-success-001",
    })),
    persistPortfolio: vi.fn(async () => ({ requestId: "persist-001" })),
    retrievePortfolio: vi.fn(async () => ({
      data: { transactions: [], signals: {}, settings: null },
      requestId: "retrieve-001",
    })),
    __setNextPriceFailure(flag) {
      shouldFailNextPrice = flag;
    },
    __getPriceCalls() {
      return priceCalls.slice();
    },
  };
});

const api = await import("../utils/api.js");

describe("App price refresh degradations", () => {
  let dom;

  beforeEach(() => {
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

  it("retains previous prices and surfaces an alert when refresh fails", async () => {
    render(<App />);

    await userEvent.click(screen.getByRole("button", { name: /transactions/i }));

    await userEvent.type(screen.getByLabelText(/date/i), "2024-02-01");
    await userEvent.type(screen.getByLabelText(/ticker/i), "aapl");
    await userEvent.type(screen.getByLabelText(/amount/i), "1250");
    await userEvent.type(screen.getByLabelText(/price/i), "125");
    await userEvent.click(screen.getByRole("button", { name: /add transaction/i }));

    await waitFor(() => {
      assert.deepEqual(api.__getPriceCalls(), ["AAPL"]);
    });

    await userEvent.click(screen.getByRole("button", { name: /holdings/i }));

    assert.ok(await screen.findByText("$125.00"));

    api.__setNextPriceFailure(true);

    await userEvent.click(screen.getByRole("button", { name: /transactions/i }));
    await userEvent.type(screen.getByLabelText(/date/i), "2024-02-02");
    await userEvent.clear(screen.getByLabelText(/ticker/i));
    await userEvent.type(screen.getByLabelText(/ticker/i), "aapl");
    await userEvent.type(screen.getByLabelText(/amount/i), "250");
    await userEvent.type(screen.getByLabelText(/price/i), "125");
    await userEvent.click(screen.getByRole("button", { name: /add transaction/i }));

    await userEvent.click(screen.getByRole("button", { name: /dashboard/i }));

    assert.ok(
      await screen.findByText("Price refresh failed"),
      "alerts when pricing request fails",
    );
    assert.ok(
      screen.getByText(
        /Unable to update prices for AAPL. Showing last known values/, 
      ),
    );
    assert.ok(screen.getByText(/Request IDs?: price-fail-001/i));

    await userEvent.click(screen.getByRole("button", { name: /holdings/i }));

    assert.ok(await screen.findByText("$125.00"));
  });

  it("shows market-closed guidance instead of an error on weekend failures", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-02-03T15:00:00Z"));

    try {
      render(<App />);

      await userEvent.click(screen.getByRole("button", { name: /transactions/i }));

      await userEvent.type(screen.getByLabelText(/date/i), "2024-02-01");
      await userEvent.type(screen.getByLabelText(/ticker/i), "msft");
      await userEvent.type(screen.getByLabelText(/amount/i), "2500");
      await userEvent.type(screen.getByLabelText(/price/i), "250");
      await userEvent.click(screen.getByRole("button", { name: /add transaction/i }));

      await waitFor(() => {
        assert.deepEqual(api.__getPriceCalls(), ["MSFT"]);
      });

      api.__setNextPriceFailure(true);

      await userEvent.type(screen.getByLabelText(/date/i), "2024-02-02");
      await userEvent.clear(screen.getByLabelText(/ticker/i));
      await userEvent.type(screen.getByLabelText(/ticker/i), "msft");
      await userEvent.type(screen.getByLabelText(/amount/i), "250");
      await userEvent.type(screen.getByLabelText(/price/i), "250");
      await userEvent.click(screen.getByRole("button", { name: /add transaction/i }));

      await userEvent.click(screen.getByRole("button", { name: /dashboard/i }));

      assert.ok(await screen.findByText(/Market is closed/i));
      assert.equal(screen.queryByText(/Price refresh failed/i), null);
    } finally {
      vi.useRealTimers();
    }
  });
});

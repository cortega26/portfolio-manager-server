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
  let shouldFailRoi = true;

  return {
    ...actual,
    __esModule: true,
    fetchBulkPrices: vi.fn(async (symbols) => {
      const list = Array.isArray(symbols) ? symbols : [];
      const series = new Map(
        list.map((symbol) => [
          String(symbol ?? "").toUpperCase(),
          [
            { date: "2024-01-01", close: 100 },
            { date: "2024-01-02", close: 105 },
          ],
        ]),
      );
      if (!series.has("SPY")) {
        series.set("SPY", [
          { date: "2024-01-01", close: 100 },
          { date: "2024-01-02", close: 105 },
        ]);
      }
      return { series, errors: {} };
    }),
    fetchPrices: vi.fn(async () => ({
      data: [
        { date: "2024-01-01", close: 100 },
        { date: "2024-01-02", close: 105 },
      ],
      requestId: "price-fallback-001",
    })),
    fetchDailyReturns: vi.fn(async () => {
      if (shouldFailRoi) {
        const error = new Error("ROI service unavailable");
        error.name = "ApiError";
        error.requestId = "returns-fail-001";
        shouldFailRoi = false;
        throw error;
      }
      return {
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
      };
    }),
    persistPortfolio: vi.fn(async () => ({ requestId: "persist-001" })),
    retrievePortfolio: vi.fn(async () => ({
      data: { transactions: [], signals: {}, settings: null },
      requestId: "retrieve-001",
    })),
  };
});

await import("../utils/api.js");

describe("App ROI fallback degradations", () => {
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

  it("alerts when ROI API fails and fallback math is used", async () => {
    render(<App />);

    await userEvent.click(screen.getByRole("button", { name: /transactions/i }));

    await userEvent.type(screen.getByLabelText(/date/i), "2024-02-01");
    await userEvent.type(screen.getByLabelText(/ticker/i), "msft");
    await userEvent.type(screen.getByLabelText(/amount/i), "1000");
    await userEvent.type(screen.getByLabelText(/price/i), "100");
    await userEvent.click(screen.getByRole("button", { name: /add transaction/i }));

    await userEvent.click(screen.getByRole("button", { name: /dashboard/i }));

    const alert = await screen.findByText("ROI service failed. Displaying locally computed fallback data.");
    assert.ok(alert, "shows ROI fallback banner");
    assert.ok(
      await screen.findByText(/Request ID: returns-fail-001/i),
      "surfaces request ID for degraded ROI mode",
    );
    assert.ok(
      await screen.findByText(/Fallback ROI/i),
      "labels ROI status as fallback",
    );

    await waitFor(() => {
      const summary = screen.getByRole("status", { name: /Fallback ROI/i });
      assert.ok(summary);
    });
  });
});

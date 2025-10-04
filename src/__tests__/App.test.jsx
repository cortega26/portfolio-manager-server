import { afterEach, beforeEach, describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { JSDOM } from "jsdom";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App.jsx";

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
  global.URL = {
    createObjectURL: () => "blob:mock",
    revokeObjectURL: () => {},
  };

  const sampleSeries = [
    { date: "2024-01-01", close: 100 },
    { date: "2024-01-02", close: 110 },
    { date: "2024-01-03", close: 120 },
  ];

  global.fetch = async (url, options = {}) => {
    const href = typeof url === "string" ? url : url.url;
    if (href.includes("/api/prices/")) {
      const symbol = href.split("/").pop().split("?")[0];
      return {
        ok: true,
        json: async () => {
          if (symbol.toLowerCase() === "spy") {
            return sampleSeries.map((point) => ({
              ...point,
              close: point.close + 5,
            }));
          }

          return sampleSeries;
        },
      };
    }

    if (href.includes("/api/portfolio/") && options.method === "POST") {
      return { ok: true, json: async () => ({}) };
    }

    if (href.includes("/api/portfolio/")) {
      return {
        ok: true,
        json: async () => ({ transactions: [], signals: {} }),
      };
    }

    throw new Error(`Unhandled fetch request: ${href}`);
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
  delete global.fetch;
  delete global.URL;
});

describe("App tab navigation", () => {
  it("renders dashboard by default and shows validation when saving without an ID", async () => {
    render(<App />);
    assert.ok(await screen.findByText("Portfolio Value"));

    const saveButton = screen.getByRole("button", { name: /save portfolio/i });
    await userEvent.click(saveButton);
    assert.ok(screen.getByText("Set a portfolio ID first."));
  });

  it("allows switching between holdings and transactions views", async () => {
    render(<App />);

    const holdingsTab = screen.getByRole("button", { name: /holdings/i });
    await userEvent.click(holdingsTab);
    assert.ok(await screen.findByText("No holdings yet."));

    const transactionsTab = screen.getByRole("button", {
      name: /transactions/i,
    });
    await userEvent.click(transactionsTab);
    assert.ok(await screen.findByText("Add Transaction"));
  });

  it("surfaces empty states for the new analytics tabs", async () => {
    render(<App />);

    await userEvent.click(screen.getByRole("button", { name: /history/i }));
    assert.ok(
      await screen.findByText(/Record transactions to see contribution trends/i),
    );

    await userEvent.click(screen.getByRole("button", { name: /metrics/i }));
    assert.ok(
      await screen.findByText(/Metrics become available after you add holdings/i),
    );

    await userEvent.click(screen.getByRole("button", { name: /reports/i }));
    assert.ok(await screen.findByText(/Reporting Snapshot/i));
    assert.ok(await screen.findByText(/Transactions/));

    await userEvent.click(screen.getByRole("button", { name: /settings/i }));
    assert.ok(await screen.findByLabelText(/Email alerts/i));
    assert.ok(await screen.findByText(/Mask balances by default/i));
  });

  it("captures a transaction and surfaces it in the holdings view", async () => {
    render(<App />);

    const transactionsTab = screen.getByRole("button", {
      name: /transactions/i,
    });
    await userEvent.click(transactionsTab);

    const dateInput = screen.getByLabelText("Date");
    fireEvent.input(dateInput, { target: { value: "2024-01-02" } });

    const tickerInput = screen.getByLabelText("Ticker");
    await userEvent.type(tickerInput, "aapl");

    const amountInput = screen.getByLabelText("Amount (USD)");
    await userEvent.type(amountInput, "1000");

    const priceInput = screen.getByLabelText("Price (USD)");
    await userEvent.type(priceInput, "100");

    const submitButton = screen.getByRole("button", {
      name: /add transaction/i,
    });
    await userEvent.click(submitButton);

    assert.ok(await screen.findByText("1.0000"));

    const holdingsTab = screen.getByRole("button", { name: /holdings/i });
    await userEvent.click(holdingsTab);

    assert.ok(await screen.findByText("AAPL"));
    assert.ok(await screen.findByText("$1,000.00"));
  });

  it("allows undoing a transaction from the transactions table", async () => {
    render(<App />);

    const transactionsTab = screen.getByRole("button", {
      name: /transactions/i,
    });
    await userEvent.click(transactionsTab);

    const dateInput = screen.getByLabelText("Date");
    fireEvent.input(dateInput, { target: { value: "2024-01-03" } });

    const tickerInput = screen.getByLabelText("Ticker");
    await userEvent.type(tickerInput, "msft");

    const amountInput = screen.getByLabelText("Amount (USD)");
    await userEvent.type(amountInput, "1500");

    const priceInput = screen.getByLabelText("Price (USD)");
    await userEvent.type(priceInput, "250");

    const submitButton = screen.getByRole("button", {
      name: /add transaction/i,
    });
    await userEvent.click(submitButton);

    const undoButton = await screen.findByRole("button", {
      name: /undo transaction for MSFT on 2024-01-03/i,
    });
    await userEvent.click(undoButton);

    assert.ok(
      await screen.findByText("No transactions recorded yet."),
    );
  });
});

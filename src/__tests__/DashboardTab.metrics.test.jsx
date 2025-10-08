import { afterEach, beforeEach, describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { JSDOM } from "jsdom";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";

import DashboardTab from "../components/DashboardTab.jsx";
import {
  computeCashBalance,
  deriveDashboardMetrics,
} from "../hooks/usePortfolioMetrics.js";

const TRANSACTION_FIXTURE = [
  { date: "2024-01-01", type: "DEPOSIT", amount: 1000 },
  { date: "2024-01-02", type: "BUY", amount: -400 },
  { date: "2024-01-05", type: "SELL", amount: 200 },
  { date: "2024-01-07", type: "WITHDRAWAL", amount: 50 },
  { date: "2024-01-09", type: "FEE", amount: 5 },
];

const METRICS_FIXTURE = {
  totalValue: 600,
  totalCost: 500,
  totalRealised: 50,
  totalUnrealised: 100,
  holdingsCount: 3,
};

const ROI_FIXTURE = [
  { date: "2024-01-01", portfolio: 0, spy: 0, blended: 0, exCash: 0, cash: 0 },
  { date: "2024-01-10", portfolio: 5.5, spy: 6, blended: 4.5, exCash: 7.2, cash: 0.9 },
];

describe("DashboardTab metrics derivation", () => {
  let dom;

  beforeEach(() => {
    dom = new JSDOM("<!doctype html><html><body></body></html>", {
      url: "http://localhost/",
    });
    global.window = dom.window;
    global.document = dom.window.document;
    global.navigator = dom.window.navigator;
    global.HTMLElement = dom.window.HTMLElement;
    global.SVGElement = dom.window.SVGElement;
    global.Node = dom.window.Node;
    global.localStorage = dom.window.localStorage;
  });

  afterEach(() => {
    cleanup();
    dom.window.close();
    delete global.window;
    delete global.document;
    delete global.navigator;
    delete global.HTMLElement;
    delete global.SVGElement;
    delete global.Node;
    delete global.localStorage;
  });

  it("computes cash balance from mixed transactions", () => {
    const balance = computeCashBalance(TRANSACTION_FIXTURE);
    assert.equal(balance, 745);
  });

  it("derives cash allocation and benchmark deltas", () => {
    const derived = deriveDashboardMetrics({
      metrics: METRICS_FIXTURE,
      transactions: TRANSACTION_FIXTURE,
      roiData: ROI_FIXTURE,
    });

    assert.equal(Math.round(derived.totals.totalNav), 1345);
    assert.equal(Math.round(derived.percentages.returnPct), 30);
    assert.ok(Math.abs(derived.percentages.cashAllocationPct - 55.35) < 0.1);
    assert.equal(derived.percentages.cashDragPct, 1.5);
    assert.equal(derived.percentages.spyDeltaPct, -0.5);
    assert.equal(derived.percentages.blendedDeltaPct, 1.0);
  });

  it("renders dashboard cards with derived KPI values", () => {
    render(
      <DashboardTab
        metrics={METRICS_FIXTURE}
        roiData={ROI_FIXTURE}
        transactions={TRANSACTION_FIXTURE}
        loadingRoi={false}
        onRefreshRoi={() => {}}
      />,
    );

    assert.ok(screen.getByText("Net Asset Value"));
    assert.ok(screen.getByText("Cash balance $745.00"));
    assert.ok(screen.getByText("Cash Allocation"));
    assert.ok(screen.getByText("55.4%"));
    assert.ok(screen.getByText(/Cash Drag/));
    assert.ok(screen.getByText(/\+1.50%/));
    assert.ok(screen.getByText(/Benchmark Delta/));
    assert.ok(screen.getByText(/Blended \+1.00%/));
  });
});

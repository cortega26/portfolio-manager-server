import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import DashboardTab from "../components/DashboardTab.jsx";
import { getBenchmarkStorageKey } from "../hooks/usePersistentBenchmarkSelection.js";

const METRICS_FIXTURE = {
  totalValue: 1000,
  totalCost: 800,
  totalUnrealised: 200,
  totalRealised: 0,
  holdingsCount: 4,
};

const ROI_FIXTURE = [
  {
    date: "2024-01-01",
    portfolio: 0,
    spy: 0,
    blended: 0,
    exCash: 0,
    cash: 0,
  },
  {
    date: "2024-01-02",
    portfolio: 1.23,
    spy: 1.1,
    blended: 0.9,
    exCash: 1.5,
    cash: 0.05,
  },
];

describe("DashboardTab benchmark controls", () => {
  beforeEach(() => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>", {
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
    delete global.window;
    delete global.document;
    delete global.navigator;
    delete global.HTMLElement;
    delete global.SVGElement;
    delete global.Node;
    delete global.localStorage;
  });

  it("toggles benchmark visibility and persists the choice", async () => {
    const user = userEvent.setup();

    render(
      <DashboardTab
        metrics={METRICS_FIXTURE}
        roiData={ROI_FIXTURE}
        loadingRoi={false}
        onRefreshRoi={() => {}}
      />,
    );

    const storageKey = getBenchmarkStorageKey();

    const spyToggle = screen.getByRole("button", {
      name: /100% spy benchmark/i,
    });
    const blendedToggle = screen.getByRole("button", {
      name: /blended benchmark/i,
    });
    const resetButton = screen.getByRole("button", { name: /reset/i });

    assert.equal(spyToggle.getAttribute("aria-pressed"), "true");
    assert.equal(blendedToggle.getAttribute("aria-pressed"), "true");
    assert.equal(resetButton.hasAttribute("disabled"), true);

    await user.click(spyToggle);
    assert.equal(spyToggle.getAttribute("aria-pressed"), "false");
    assert.equal(blendedToggle.getAttribute("aria-pressed"), "true");
    assert.equal(resetButton.hasAttribute("disabled"), false);
    assert.deepEqual(JSON.parse(window.localStorage.getItem(storageKey)), ["blended"]);

    await user.click(resetButton);
    assert.equal(spyToggle.getAttribute("aria-pressed"), "true");
    assert.equal(blendedToggle.getAttribute("aria-pressed"), "true");
    assert.equal(resetButton.hasAttribute("disabled"), true);
    assert.deepEqual(JSON.parse(window.localStorage.getItem(storageKey)), ["spy", "blended"]);

    cleanup();

    render(
      <DashboardTab
        metrics={METRICS_FIXTURE}
        roiData={ROI_FIXTURE}
        loadingRoi={false}
        onRefreshRoi={() => {}}
      />,
    );

    const spyTogglePersisted = screen.getByRole("button", {
      name: /100% spy benchmark/i,
    });
    assert.equal(spyTogglePersisted.getAttribute("aria-pressed"), "false");
    const resetButtonPersisted = screen.getByRole("button", { name: /reset/i });
    assert.equal(resetButtonPersisted.hasAttribute("disabled"), false);
  });
});

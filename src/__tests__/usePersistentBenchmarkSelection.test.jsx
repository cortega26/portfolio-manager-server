import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  getBenchmarkStorageKey,
  usePersistentBenchmarkSelection,
} from "../hooks/usePersistentBenchmarkSelection.js";

function HookHarness({ available }) {
  const [selection, setSelection] = usePersistentBenchmarkSelection(available, ["spy"]);
  return (
    <div>
      <p data-testid="selection">{selection.join(",")}</p>
      <button type="button" onClick={() => setSelection((prev) => prev.filter((id) => id !== "spy"))}>
        remove-spy
      </button>
      <button type="button" onClick={() => setSelection((prev) => [...prev, "blended"])}>
        add-blended
      </button>
    </div>
  );
}

describe("usePersistentBenchmarkSelection", () => {
  beforeEach(() => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>", {
      url: "http://localhost/",
    });
    global.window = dom.window;
    global.document = dom.window.document;
    global.navigator = dom.window.navigator;
    global.localStorage = dom.window.localStorage;
  });

  afterEach(() => {
    cleanup();
    delete global.window;
    delete global.document;
    delete global.navigator;
    delete global.localStorage;
  });

  it("stores the user selection in localStorage", async () => {
    const user = userEvent.setup();

    render(<HookHarness available={["spy", "blended"]} />);
    const selectionNode = screen.getByTestId("selection");
    assert.equal(selectionNode.textContent, "spy");

    await user.click(screen.getByText("add-blended"));
    assert.equal(selectionNode.textContent, "spy,blended");

    await user.click(screen.getByText("remove-spy"));
    assert.equal(selectionNode.textContent, "blended");

    const stored = window.localStorage.getItem(getBenchmarkStorageKey());
    assert.ok(stored);
    assert.deepEqual(JSON.parse(stored), ["blended"]);
  });

  it("falls back to first available option when selection becomes empty", async () => {
    const user = userEvent.setup();

    render(<HookHarness available={["spy"]} />);
    const selectionNode = screen.getByTestId("selection");
    assert.equal(selectionNode.textContent, "spy");

    await user.click(screen.getByText("remove-spy"));
    assert.equal(selectionNode.textContent, "spy");
  });
});

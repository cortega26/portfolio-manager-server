import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { act, cleanup, renderHook } from "@testing-library/react";
import { JSDOM } from "jsdom";

import useDebouncedValue from "../hooks/useDebouncedValue.js";

function createFakeTimers() {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  let now = 0;
  const scheduled = new Map();
  let nextId = 0;

  function schedule(handler, delay = 0, args) {
    const target = now + Math.max(0, Number(delay) || 0);
    const id = ++nextId;
    scheduled.set(id, { handler, args, time: target });
    return id;
  }

  function advance(ms) {
    if (!Number.isFinite(ms) || ms < 0) {
      throw new TypeError("advance requires a non-negative number");
    }
    now += ms;
    const due = [...scheduled.entries()]
      .filter(([, value]) => value.time <= now)
      .sort(([, a], [, b]) => a.time - b.time);
    for (const [id, value] of due) {
      scheduled.delete(id);
      value.handler(...value.args);
    }
  }

  function install() {
    globalThis.setTimeout = (handler, delay, ...args) =>
      schedule(typeof handler === "function" ? handler : () => {}, delay, args);
    globalThis.clearTimeout = (id) => {
      scheduled.delete(id);
    };
  }

  function restore() {
    scheduled.clear();
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }

  return { advance, install, restore };
}

let timers;
let dom;

beforeEach(() => {
  dom = new JSDOM("<!doctype html><html><body></body></html>");
  global.window = dom.window;
  global.document = dom.window.document;
  Object.defineProperty(global, "navigator", {
    value: dom.window.navigator,
    configurable: true,
  });
  timers = createFakeTimers();
  timers.install();
});

afterEach(() => {
  cleanup();
  timers.restore();
  dom.window.close();
  delete global.window;
  delete global.document;
  delete global.navigator;
});

test("useDebouncedValue delays updates until debounce window elapses", () => {
  const { result, rerender } = renderHook(({ value, delay }) =>
    useDebouncedValue(value, delay),
  {
    initialProps: { value: "AAPL", delay: 300 },
  });

  assert.equal(result.current, "AAPL");

  rerender({ value: "MSFT", delay: 300 });
  act(() => {
    timers.advance(299);
  });
  assert.equal(result.current, "AAPL");

  act(() => {
    timers.advance(1);
  });
  assert.equal(result.current, "MSFT");
});

test("useDebouncedValue applies default delay when provided value is invalid", () => {
  const { result, rerender } = renderHook(({ value, delay }) =>
    useDebouncedValue(value, delay),
  {
    initialProps: { value: "initial", delay: -10 },
  });

  assert.equal(result.current, "initial");

  rerender({ value: "next", delay: Number.NaN });
  act(() => {
    timers.advance(299);
  });
  assert.equal(result.current, "initial");

  act(() => {
    timers.advance(1);
  });
  assert.equal(result.current, "next");
});

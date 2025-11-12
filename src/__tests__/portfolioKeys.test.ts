import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  loadPortfolioKey,
  removePortfolioKey,
  savePortfolioKey,
  __dangerous__resetPortfolioKeyVault,
} from "../utils/portfolioKeys.js";

describe("portfolioKeys", () => {
  beforeEach(() => {
    __dangerous__resetPortfolioKeyVault();
  });

  afterEach(() => {
    __dangerous__resetPortfolioKeyVault();
    vi.restoreAllMocks();
    Reflect.deleteProperty(globalThis, "localStorage");
  });

  test("returns empty string when nothing was persisted", () => {
    expect(loadPortfolioKey("abc")).toBe("");
  });

  test("persists keys only in memory", () => {
    const setItem = vi.fn(() => {
      throw new Error("localStorage should not be used for portfolio keys");
    });
    const getItem = vi.fn(() => {
      throw new Error("localStorage should not be used for portfolio keys");
    });
    Object.defineProperty(global, "localStorage", {
      configurable: true,
      value: { setItem, getItem },
    });
    const saved = savePortfolioKey("abc", "secret");
    expect(saved).toBe(true);
    expect(loadPortfolioKey("abc")).toBe("secret");
    expect(setItem).not.toHaveBeenCalled();
    expect(getItem).not.toHaveBeenCalled();
  });

  test("removes entries when asked", () => {
    savePortfolioKey("abc", "secret");
    removePortfolioKey("abc");
    expect(loadPortfolioKey("abc")).toBe("");
  });
});

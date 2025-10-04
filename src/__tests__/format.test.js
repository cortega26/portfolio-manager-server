import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { formatCurrency, formatPercent } from "../utils/format.js";

describe("format utilities", () => {
  it("formats currency with fallback for invalid inputs", () => {
    assert.equal(formatCurrency(1234.567), "$1,234.57");
    assert.equal(formatCurrency(null), "—");
    assert.equal(formatCurrency(Number.NaN), "—");
  });

  it("formats percentage values with precision control", () => {
    assert.equal(formatPercent(12.3456), "12.35%");
    assert.equal(formatPercent(9.1, 1), "9.1%");
    assert.equal(formatPercent(undefined), "—");
  });
});

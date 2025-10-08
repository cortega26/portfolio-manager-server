import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { formatCurrency, formatPercent, formatSignedPercent } from "../utils/format.js";

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

  it("formats signed percentage deltas", () => {
    assert.equal(formatSignedPercent(1.234, 2), "+1.23%");
    assert.equal(formatSignedPercent(-0.987, 2), "-0.99%");
    assert.equal(formatSignedPercent(0, 2), "0.00%");
    assert.equal(formatSignedPercent(Number.NaN, 2), "—");
  });
});

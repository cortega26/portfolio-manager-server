import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { getMarketClock } from "../../src/utils/marketHours.js";

// Build a date in New York time to avoid DST surprises
function nyDate(year, month, day, hour, minute = 0) {
  // Create the date at noon UTC for a given NY date, then adjust the offset
  // We use a trick: format in NY and reconstruct as UTC
  const iso = `${String(year)}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
  // Use Intl to find the UTC offset for this moment in NY
  const base = new Date(`${iso}-05:00`); // EST offset as a first guess
  const nyFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = nyFmt.formatToParts(base);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  const diffMinutes = (hour * 60 + minute) - (h * 60 + m);
  return new Date(base.getTime() - diffMinutes * 60_000);
}

// Wednesday 2026-03-25 is a regular trading day — safe reference point
const TRADING_DAY_YEAR = 2026;
const TRADING_DAY_MONTH = 3;
const TRADING_DAY = 25;

describe("getMarketClock – isExtendedHours", () => {
  test("is false during regular trading hours (10 AM NY)", () => {
    const clock = getMarketClock(nyDate(TRADING_DAY_YEAR, TRADING_DAY_MONTH, TRADING_DAY, 10));
    assert.equal(clock.isOpen, true);
    assert.equal(clock.isExtendedHours, false);
  });

  test("is true in pre-market window (6 AM NY)", () => {
    const clock = getMarketClock(nyDate(TRADING_DAY_YEAR, TRADING_DAY_MONTH, TRADING_DAY, 6));
    assert.equal(clock.isOpen, false);
    assert.equal(clock.isExtendedHours, true);
  });

  test("is true in after-hours window (5 PM NY)", () => {
    const clock = getMarketClock(nyDate(TRADING_DAY_YEAR, TRADING_DAY_MONTH, TRADING_DAY, 17));
    assert.equal(clock.isOpen, false);
    assert.equal(clock.isExtendedHours, true);
  });

  test("is false at midnight NY (outside both extended windows)", () => {
    const clock = getMarketClock(nyDate(TRADING_DAY_YEAR, TRADING_DAY_MONTH, TRADING_DAY, 1));
    assert.equal(clock.isOpen, false);
    assert.equal(clock.isExtendedHours, false);
  });

  test("is false after 8 PM NY (extended session closed)", () => {
    const clock = getMarketClock(nyDate(TRADING_DAY_YEAR, TRADING_DAY_MONTH, TRADING_DAY, 21));
    assert.equal(clock.isOpen, false);
    assert.equal(clock.isExtendedHours, false);
  });

  test("is false on a Saturday regardless of hour", () => {
    // 2026-03-28 is a Saturday
    const clock = getMarketClock(nyDate(2026, 3, 28, 10));
    assert.equal(clock.isOpen, false);
    assert.equal(clock.isExtendedHours, false);
  });

  test("is false on a market holiday", () => {
    // 2026-01-01 is New Year's Day — market closed
    const clock = getMarketClock(nyDate(2026, 1, 1, 6));
    assert.equal(clock.isOpen, false);
    assert.equal(clock.isExtendedHours, false);
  });

  test("boundary: exactly at pre-market open (4:00 AM NY) is extended", () => {
    const clock = getMarketClock(nyDate(TRADING_DAY_YEAR, TRADING_DAY_MONTH, TRADING_DAY, 4, 0));
    assert.equal(clock.isOpen, false);
    assert.equal(clock.isExtendedHours, true);
  });

  test("boundary: exactly at market open (9:30 AM NY) is NOT extended", () => {
    const clock = getMarketClock(nyDate(TRADING_DAY_YEAR, TRADING_DAY_MONTH, TRADING_DAY, 9, 30));
    assert.equal(clock.isOpen, true);
    assert.equal(clock.isExtendedHours, false);
  });

  test("boundary: exactly at market close (4:00 PM NY) is extended (after-hours starts)", () => {
    const clock = getMarketClock(nyDate(TRADING_DAY_YEAR, TRADING_DAY_MONTH, TRADING_DAY, 16, 0));
    assert.equal(clock.isOpen, false);
    assert.equal(clock.isExtendedHours, true);
  });

  test("boundary: exactly at 8:00 PM NY is NOT extended (session ended)", () => {
    const clock = getMarketClock(nyDate(TRADING_DAY_YEAR, TRADING_DAY_MONTH, TRADING_DAY, 20, 0));
    assert.equal(clock.isOpen, false);
    assert.equal(clock.isExtendedHours, false);
  });
});

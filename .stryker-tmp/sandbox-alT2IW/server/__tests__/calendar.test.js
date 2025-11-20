// @ts-nocheck
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  isTradingDay,
  computeTradingDayAge,
  nextTradingDay,
} from '../utils/calendar.js';

test('isTradingDay returns false for weekends and true for weekdays', () => {
  assert.equal(isTradingDay(new Date('2024-02-10T00:00:00Z')), false); // Saturday
  assert.equal(isTradingDay(new Date('2024-02-11T00:00:00Z')), false); // Sunday
  assert.equal(isTradingDay(new Date('2024-02-12T00:00:00Z')), true); // Monday
});

test('isTradingDay covers observed US market holidays', () => {
  // New Year 2023 observed on Monday Jan 2
  assert.equal(isTradingDay(new Date('2023-01-02T00:00:00Z')), false);
  // Independence Day 2021 observed on Monday Jul 5
  assert.equal(isTradingDay(new Date('2021-07-05T00:00:00Z')), false);
  // Good Friday 2024
  assert.equal(isTradingDay(new Date('2024-03-29T00:00:00Z')), false);
  // Day after Good Friday should be trading day (even during leap year)
  assert.equal(isTradingDay(new Date('2024-04-01T00:00:00Z')), true);
});

test('computeTradingDayAge skips weekends and holidays', () => {
  const latest = '2021-07-02'; // Friday before July 4 weekend
  const reference = new Date('2021-07-06T00:00:00Z'); // Tuesday after observed holiday
  assert.equal(computeTradingDayAge(latest, reference), 1);
});

test('nextTradingDay advances over consecutive non-trading days', () => {
  assert.equal(nextTradingDay('2021-07-02'), '2021-07-06');
  assert.equal(nextTradingDay('2023-12-29'), '2024-01-02');
});

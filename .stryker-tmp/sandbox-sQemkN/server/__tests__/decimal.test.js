// @ts-nocheck
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  d,
  fromCents,
  fromMicroShares,
  toCents,
  toMicroShares,
} from '../finance/decimal.js';

test('toCents and fromCents round-trip to the nearest cent', () => {
  const samples = [0, 0.004, 0.005, 1.234, -5.5555, 1024.999];
  for (const value of samples) {
    const cents = toCents(value);
    const restored = fromCents(cents);
    const expected = d(value).toDecimalPlaces(2);
    assert.equal(restored.toNumber(), expected.toNumber());
  }
});

test('micro-share conversions preserve six decimal places', () => {
  const values = [0.123456, -1.234567, 42.000001];
  for (const value of values) {
    const micro = toMicroShares(value);
    const restored = fromMicroShares(micro);
    const expected = d(value).toDecimalPlaces(6);
    assert.equal(restored.toNumber(), expected.toNumber());
  }
});

test('random cent conversions remain stable across repeated round-trips', () => {
  let maxError = 0;
  for (let i = 0; i < 200; i += 1) {
    const value = (Math.random() - 0.5) * 1_000_000;
    const cents = toCents(value);
    const restored = fromCents(cents);
    const diff = Math.abs(restored.minus(value).toNumber());
    if (diff > maxError) {
      maxError = diff;
    }
  }
  assert.ok(maxError <= 0.005);
});

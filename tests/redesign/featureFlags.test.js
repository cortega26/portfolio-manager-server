/**
 * SR-100 — Feature flag system
 *
 * Tests for the feature flag resolver.
 * Covers: default flags are all false, localStorage overrides work,
 * unknown flags return false, flag reading is type-safe.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

// Import the flag resolver (pure function — testable without browser globals)
import { resolveFlags, getFlag, FLAG_DEFAULTS } from '../../src/lib/featureFlags.js';

const ALL_FLAGS = Object.keys(FLAG_DEFAULTS);

// ---------------------------------------------------------------------------
// Default state
// ---------------------------------------------------------------------------

test('FLAG_DEFAULTS: all flags default to false', () => {
  for (const flag of ALL_FLAGS) {
    assert.strictEqual(FLAG_DEFAULTS[flag], false, `Flag "${flag}" should default to false`);
  }
});

test('resolveFlags: with no overrides returns all defaults', () => {
  const flags = resolveFlags({});
  for (const flag of ALL_FLAGS) {
    assert.strictEqual(flags[flag], false, `Expected flag "${flag}" to be false`);
  }
});

test('resolveFlags: override turns a flag on', () => {
  const flags = resolveFlags({ 'redesign.todayShell': true });
  assert.strictEqual(flags['redesign.todayShell'], true);
  // Other flags remain false
  assert.strictEqual(flags['redesign.trustBadges'], false);
  assert.strictEqual(flags['redesign.ledgerOpsCenter'], false);
});

test('resolveFlags: unknown override keys are ignored', () => {
  const flags = resolveFlags({ 'unknown.flag': true });
  assert.ok(!('unknown.flag' in flags), 'unknown flags must not appear in output');
});

test('resolveFlags: non-boolean overrides are coerced to boolean', () => {
  const flags = resolveFlags({ 'redesign.trustBadges': 1 });
  assert.strictEqual(flags['redesign.trustBadges'], true);

  const flags2 = resolveFlags({ 'redesign.trustBadges': 0 });
  assert.strictEqual(flags2['redesign.trustBadges'], false);
});

test('getFlag: returns false for unknown flag', () => {
  const flags = resolveFlags({});
  assert.strictEqual(getFlag(flags, 'redesign.nonexistent'), false);
});

test('getFlag: returns override value for known flag', () => {
  const flags = resolveFlags({ 'redesign.todayShell': true });
  assert.strictEqual(getFlag(flags, 'redesign.todayShell'), true);
});

// ---------------------------------------------------------------------------
// Expected flag names are all present
// ---------------------------------------------------------------------------

test('FLAG_DEFAULTS: contains all required redesign flags', () => {
  const required = [
    'redesign.todayShell',
    'redesign.trustBadges',
    'redesign.ledgerOpsCenter',
    'redesign.policyGuidance',
  ];
  for (const flag of required) {
    assert.ok(flag in FLAG_DEFAULTS, `Required flag "${flag}" missing from FLAG_DEFAULTS`);
  }
});

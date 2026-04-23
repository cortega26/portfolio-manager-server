/**
 * SR-007 — i18n defaultValue fix
 *
 * Tests for the translation lookup + defaultValue fallback logic.
 * Covers: key found in table, key missing with defaultValue, key missing without defaultValue,
 * interpolation of {token} vars, and that defaultValue is not leaked into interpolation.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

// Import the pure translation helpers (will be created in shared/i18nUtils.js)
import { translate, interpolate } from '../../src/i18n/i18nUtils.js';

const TABLE = {
  en: {
    'known.key': 'Hello, {name}!',
    'dashboard.zone2.empty': 'No alerts or action items. Portfolio is up to date.',
    'dashboard.zone2.emptyAria': 'Action inbox',
    'dashboard.charts.title': 'Portfolio charts',
  },
};

test('translate: returns translation for known key', () => {
  const result = translate(TABLE, 'en', 'known.key', { name: 'Alice' });
  assert.equal(result, 'Hello, Alice!');
});

test('translate: falls back to defaultValue when key is missing', () => {
  const result = translate(TABLE, 'en', 'unknown.key', { defaultValue: 'Fallback text' });
  assert.equal(result, 'Fallback text');
});

test('translate: returns raw key when key is missing and no defaultValue', () => {
  const result = translate(TABLE, 'en', 'unknown.key');
  assert.equal(result, 'unknown.key');
});

test('translate: defaultValue does not appear in interpolation output', () => {
  const result = translate(TABLE, 'en', 'known.key', {
    name: 'Bob',
    defaultValue: 'SHOULD_NOT_APPEAR',
  });
  assert.equal(result, 'Hello, Bob!');
  assert.ok(!result.includes('SHOULD_NOT_APPEAR'));
});

test('translate: dashboard.zone2.empty resolves from table', () => {
  const result = translate(TABLE, 'en', 'dashboard.zone2.empty');
  assert.equal(result, 'No alerts or action items. Portfolio is up to date.');
  assert.ok(!result.includes('dashboard.zone2.empty'), 'raw key must not appear in output');
});

test('translate: dashboard.charts.title resolves from table', () => {
  const result = translate(TABLE, 'en', 'dashboard.charts.title');
  assert.equal(result, 'Portfolio charts');
  assert.ok(!result.includes('dashboard.charts.title'), 'raw key must not appear in output');
});

test('translate: returns key with {defaultValue} not as interpolation token', () => {
  // A key with defaultValue in vars should not substitute {defaultValue} in the template
  const result = translate(TABLE, 'en', 'known.key', { defaultValue: 'X', name: 'Carl' });
  assert.ok(!result.includes('X'));
  assert.equal(result, 'Hello, Carl!');
});

test('interpolate: replaces {tokens} correctly', () => {
  assert.equal(interpolate('Hello, {name}!', { name: 'World' }), 'Hello, World!');
  assert.equal(interpolate('A: {a}, B: {b}', { a: '1', b: '2' }), 'A: 1, B: 2');
});

test('interpolate: leaves unknown {tokens} intact', () => {
  assert.equal(interpolate('Hello, {unknown}!', {}), 'Hello, {unknown}!');
});

test('interpolate: handles empty vars', () => {
  assert.equal(interpolate('Hello!', {}), 'Hello!');
  assert.equal(interpolate('Hello!', undefined), 'Hello!');
});

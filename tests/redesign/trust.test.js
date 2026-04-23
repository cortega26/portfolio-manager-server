/**
 * SR-001 — Trust metadata schema
 * SR-003 — Price status → trust mapping
 *
 * Tests for trust type helpers and the price status → trust mapping utility.
 * Covers: buildTrustFromPriceStatus for all known statuses, confidence rules,
 * and degraded reasons.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildTrustFromPriceStatus,
  buildUnknownTrust,
  isTrustHigh,
  PRICE_STATUS_TO_TRUST,
} from '../../shared/trustUtils.js';

// ---------------------------------------------------------------------------
// buildTrustFromPriceStatus — mapping correctness
// ---------------------------------------------------------------------------

test('buildTrustFromPriceStatus: live → high confidence, fresh, live source', () => {
  const trust = buildTrustFromPriceStatus('live', '2026-04-22T16:00:00Z');
  assert.equal(trust.source_type, 'live');
  assert.equal(trust.freshness_state, 'fresh');
  assert.equal(trust.confidence_state, 'high');
  assert.equal(trust.as_of, '2026-04-22T16:00:00Z');
  assert.ok(!trust.degraded_reason, 'no degraded_reason for high confidence');
});

test('buildTrustFromPriceStatus: eod_fresh → high confidence, fresh, eod source', () => {
  const trust = buildTrustFromPriceStatus('eod_fresh', '2026-04-22T00:00:00Z');
  assert.equal(trust.source_type, 'eod');
  assert.equal(trust.freshness_state, 'fresh');
  assert.equal(trust.confidence_state, 'high');
});

test('buildTrustFromPriceStatus: cache_fresh → medium confidence, stale, cached source', () => {
  const trust = buildTrustFromPriceStatus('cache_fresh', '2026-04-20T00:00:00Z');
  assert.equal(trust.source_type, 'cached');
  assert.equal(trust.freshness_state, 'stale');
  assert.equal(trust.confidence_state, 'medium');
});

test('buildTrustFromPriceStatus: degraded → low confidence, stale, cached source', () => {
  const trust = buildTrustFromPriceStatus('degraded', '2026-04-18T00:00:00Z');
  assert.equal(trust.source_type, 'cached');
  assert.equal(trust.freshness_state, 'stale');
  assert.equal(trust.confidence_state, 'low');
});

test('buildTrustFromPriceStatus: unavailable → degraded, unknown source', () => {
  const trust = buildTrustFromPriceStatus('unavailable', null);
  assert.equal(trust.source_type, 'unknown');
  assert.equal(trust.freshness_state, 'unknown');
  assert.equal(trust.confidence_state, 'degraded');
  assert.equal(trust.degraded_reason, 'missing_price');
});

test('buildTrustFromPriceStatus: unknown status → degraded, unknown source', () => {
  const trust = buildTrustFromPriceStatus('some_unknown_status', null);
  assert.equal(trust.source_type, 'unknown');
  assert.equal(trust.confidence_state, 'degraded');
  assert.equal(trust.degraded_reason, 'provider_error');
});

// ---------------------------------------------------------------------------
// buildUnknownTrust — fallback when no price data at all
// ---------------------------------------------------------------------------

test('buildUnknownTrust: returns fully unknown trust object', () => {
  const trust = buildUnknownTrust();
  assert.equal(trust.source_type, 'unknown');
  assert.equal(trust.freshness_state, 'unknown');
  assert.equal(trust.confidence_state, 'unknown');
  assert.ok(!trust.as_of, 'no as_of for unknown trust');
});

// ---------------------------------------------------------------------------
// isTrustHigh — convenience predicate
// ---------------------------------------------------------------------------

test('isTrustHigh: returns true for high confidence', () => {
  const trust = buildTrustFromPriceStatus('live', '2026-04-22T16:00:00Z');
  assert.ok(isTrustHigh(trust));
});

test('isTrustHigh: returns false for degraded', () => {
  const trust = buildTrustFromPriceStatus('unavailable', null);
  assert.ok(!isTrustHigh(trust));
});

test('isTrustHigh: returns false for medium confidence', () => {
  const trust = buildTrustFromPriceStatus('cache_fresh', '2026-04-20T00:00:00Z');
  assert.ok(!isTrustHigh(trust));
});

// ---------------------------------------------------------------------------
// PRICE_STATUS_TO_TRUST — covers all expected statuses
// ---------------------------------------------------------------------------

test('PRICE_STATUS_TO_TRUST: covers all expected price status values', () => {
  const expectedStatuses = ['live', 'eod_fresh', 'cache_fresh', 'degraded', 'unavailable'];
  for (const status of expectedStatuses) {
    assert.ok(
      status in PRICE_STATUS_TO_TRUST,
      `PRICE_STATUS_TO_TRUST must cover status "${status}"`
    );
  }
});

// ---------------------------------------------------------------------------
// JSON round-trip — all trust objects are serializable
// ---------------------------------------------------------------------------

test('trust objects are JSON round-trippable', () => {
  const statuses = ['live', 'eod_fresh', 'cache_fresh', 'degraded', 'unavailable'];
  for (const status of statuses) {
    const trust = buildTrustFromPriceStatus(status, '2026-04-22T00:00:00Z');
    const json = JSON.stringify(trust);
    const parsed = JSON.parse(json);
    assert.deepEqual(parsed, trust, `Round-trip failed for status: ${status}`);
  }
});

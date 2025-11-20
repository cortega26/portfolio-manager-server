// @ts-nocheck
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import {
  SECURITY_AUDIT_DEFAULT_MAX_EVENTS,
} from '../../shared/constants.js';
import { createSecurityEventStore } from '../security/eventsStore.js';

describe('createSecurityEventStore', () => {
  let store;

  beforeEach(() => {
    store = createSecurityEventStore({ maxEvents: 3 });
  });

  afterEach(() => {
    store.clear();
  });

  test('drops oldest events and clamps returned list size', () => {
    for (let index = 0; index < 5; index += 1) {
      const event = {
        event_type: 'security',
        event: 'auth_failed',
        timestamp: new Date(`2025-01-0${(index % 9) + 1}T00:00:00.000Z`),
        requestId: `req-${index}`,
      };
      store.record(event);
    }

    assert.equal(store.size(), 3);

    const listed = store.list({ limit: 100 });
    assert.equal(listed.length, 3);
    const sequences = listed.map((entry) => entry.sequence);
    const sorted = [...sequences].sort((a, b) => b - a);
    assert.deepEqual(sequences, sorted);

    for (const entry of listed) {
      assert.ok(Number.isFinite(Date.parse(entry.timestamp)));
      assert.ok(Number.isFinite(Date.parse(entry.recordedAt)));
      assert.ok(entry.sequence >= 1);
    }
  });

  test('normalizes requestId and timestamp inputs without mutating original event', () => {
    const payload = {
      event_type: 'security',
      event: 'auth_success',
      timestamp: 0,
      requestId: 'abc-123',
    };

    const recorded = store.record(payload);
    assert.ok(recorded);
    assert.equal(recorded.request_id, 'abc-123');
    assert.ok(!('request_id' in payload));
    assert.equal(payload.requestId, 'abc-123');
    assert.ok(typeof recorded.timestamp === 'string');
    assert.ok(Number.isFinite(Date.parse(recorded.timestamp)));
    assert.ok(Number.isFinite(Date.parse(recorded.recordedAt)));
  });

  test('list clones entries to keep store immutable', () => {
    store.record({ event_type: 'security', event: 'auth_success' });
    store.record({ event_type: 'security', event: 'auth_failed' });

    const [latest] = store.list();
    latest.event = 'tampered';
    latest.sequence = -1;

    const [fresh] = store.list();
    assert.equal(fresh.event, 'auth_failed');
    assert.ok(fresh.sequence > 0);
  });

  test('clear removes stored events and resets sequence counter', () => {
    store.record({ event_type: 'security', event: 'auth_success' });
    store.record({ event_type: 'security', event: 'auth_failed' });
    assert.equal(store.size(), 2);

    store.clear();
    assert.equal(store.size(), 0);

    const newEvent = store.record({ event_type: 'security', event: 'auth_success' });
    assert.equal(store.size(), 1);
    assert.equal(newEvent.sequence, 1);
  });

  test('ignores events that are not security typed', () => {
    const result = store.record({ event_type: 'metrics', event: 'latency' });
    assert.equal(result, null);
    assert.equal(store.size(), 0);
  });

  test('falls back to default max events when configuration is invalid', () => {
    const defaultStore = createSecurityEventStore({ maxEvents: 'invalid' });
    assert.equal(defaultStore.limit, SECURITY_AUDIT_DEFAULT_MAX_EVENTS);

    for (let index = 0; index < SECURITY_AUDIT_DEFAULT_MAX_EVENTS + 5; index += 1) {
      defaultStore.record({ event_type: 'security', event: 'auth_success' });
    }

    assert.equal(defaultStore.size(), SECURITY_AUDIT_DEFAULT_MAX_EVENTS);
  });
});

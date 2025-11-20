// @ts-nocheck
import {
  SECURITY_AUDIT_DEFAULT_MAX_EVENTS,
  SECURITY_AUDIT_MAX_EVENTS,
  SECURITY_AUDIT_MIN_EVENTS,
} from '../../shared/constants.js';

function clampLimit(value, fallback) {
  const numeric = Number.parseInt(value, 10);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(
    Math.max(numeric, SECURITY_AUDIT_MIN_EVENTS),
    SECURITY_AUDIT_MAX_EVENTS,
  );
}

function toIsoString(value) {
  if (value instanceof Date) {
    const time = value.getTime();
    if (Number.isFinite(time)) {
      return value.toISOString();
    }
    return new Date().toISOString();
  }

  if (typeof value === 'number') {
    const date = new Date(value);
    if (Number.isFinite(date.getTime())) {
      return date.toISOString();
    }
    return new Date().toISOString();
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  return new Date().toISOString();
}

function cloneEvent(event) {
  if (typeof structuredClone === 'function') {
    return structuredClone(event);
  }
  return JSON.parse(JSON.stringify(event));
}

function normalizeEvent(event, sequence) {
  const cloned = cloneEvent(event ?? {});

  if (typeof cloned.requestId === 'string' && !cloned.request_id) {
    cloned.request_id = cloned.requestId;
    delete cloned.requestId;
  }

  cloned.event_type = cloned.event_type ?? 'security';
  cloned.timestamp = toIsoString(cloned.timestamp ?? Date.now());
  cloned.recordedAt = toIsoString(Date.now());
  cloned.sequence = sequence;

  return cloned;
}

export function createSecurityEventStore({ maxEvents } = {}) {
  const limit = clampLimit(maxEvents, SECURITY_AUDIT_DEFAULT_MAX_EVENTS);
  const events = [];
  let sequence = 0;

  function record(event) {
    if (!event || event.event_type !== 'security') {
      return null;
    }

    sequence += 1;
    const normalized = normalizeEvent(event, sequence);
    events.push(normalized);
    if (events.length > limit) {
      events.splice(0, events.length - limit);
    }

    return normalized;
  }

  function list({ limit: requestedLimit } = {}) {
    const effectiveLimit = clampLimit(
      requestedLimit,
      Math.min(limit, SECURITY_AUDIT_DEFAULT_MAX_EVENTS),
    );
    const sliceStart = Math.max(0, events.length - effectiveLimit);
    return events
      .slice(sliceStart)
      .map((entry) => cloneEvent(entry))
      .reverse();
  }

  function clear() {
    events.length = 0;
    sequence = 0;
  }

  function size() {
    return events.length;
  }

  return {
    record,
    list,
    clear,
    size,
    limit,
  };
}

export default createSecurityEventStore;

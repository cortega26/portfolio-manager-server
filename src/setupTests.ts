import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterAll, vi } from 'vitest';

(globalThis as unknown as { React?: typeof React }).React = React;

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(String(key), String(value));
    },
  } as Storage;
}

function ensureLocalStorage() {
  if (typeof window === 'undefined') {
    return;
  }
  const hasWorkingStorage = (candidate: Storage | null | undefined): candidate is Storage => {
    if (!candidate) {
      return false;
    }
    if (typeof candidate.getItem !== 'function' || typeof candidate.setItem !== 'function') {
      return false;
    }
    try {
      const probeKey = '__vitest_localStorage_probe__';
      candidate.setItem(probeKey, '1');
      candidate.removeItem(probeKey);
      return true;
    } catch {
      return false;
    }
  };

  let candidate: Storage | null = null;
  try {
    candidate = window.localStorage;
  } catch {
    candidate = null;
  }

  if (hasWorkingStorage(candidate)) {
    (globalThis as typeof globalThis & { localStorage?: Storage }).localStorage ??= candidate;
    return;
  }

  const memoryStorage = createMemoryStorage();
  Object.defineProperty(window, 'localStorage', {
    value: memoryStorage,
    configurable: true,
    writable: true,
  });
  (globalThis as typeof globalThis & { localStorage?: Storage }).localStorage = memoryStorage;
}

ensureLocalStorage();

const allowList = [
  /Warning: .*act\(\)/i,
  /StrictMode/i,
  /deprecated/i
];

const patch = (type: 'error' | 'warn') => {
  const orig = console[type];
  vi.spyOn(console, type).mockImplementation((...args: unknown[]) => {
    const msg = String(args.join(' '));
    if (allowList.some((r) => r.test(msg))) return;
    throw new Error(`console.${type}: ${msg}`);
  });
  return () => {
    console[type] = orig;
  };
};

const restoreError = patch('error');
const restoreWarn = patch('warn');

afterAll(() => {
  restoreError();
  restoreWarn();
  vi.restoreAllMocks();
});

// Network guard (tests must be offline)
if (typeof process !== 'undefined') {
  process.env.NO_NETWORK_TESTS = '1';
}

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterAll, vi } from 'vitest';

(globalThis as unknown as { React?: typeof React }).React = React;

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

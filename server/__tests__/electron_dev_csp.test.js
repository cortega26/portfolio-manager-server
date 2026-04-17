import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildElectronDevCsp,
  getElectronDevConnectSrc,
} from '../../scripts/lib/electronDevCsp.js';

function parseCsp(csp) {
  const directives = new Map();
  for (const segment of csp.split(';')) {
    const trimmed = segment.trim();
    if (!trimmed) {
      continue;
    }
    const [name, ...values] = trimmed.split(/\s+/u);
    directives.set(name, values);
  }
  return directives;
}

test('buildElectronDevCsp defaults to a dev-safe policy with loopback access', () => {
  const csp = buildElectronDevCsp({ host: '127.0.0.1' });
  const directives = parseCsp(csp);

  assert.deepEqual(directives.get('default-src'), ["'self'"]);
  assert.deepEqual(directives.get('script-src'), ["'self'", "'unsafe-eval'", "'wasm-unsafe-eval'"]);
  assert.deepEqual(directives.get('connect-src'), getElectronDevConnectSrc('127.0.0.1'));
});

test('buildElectronDevCsp merges required loopback origins into restrictive custom connect-src', () => {
  const csp = buildElectronDevCsp({
    host: 'localhost',
    baseCsp: [
      "default-src 'self'",
      "img-src 'self' data: blob:",
      "connect-src 'self' https://example.com",
      "frame-ancestors 'none'",
    ].join('; '),
  });
  const directives = parseCsp(csp);
  const connectSrc = directives.get('connect-src');

  assert.ok(connectSrc.includes('https://example.com'));
  assert.ok(connectSrc.includes('http://127.0.0.1:*'));
  assert.ok(connectSrc.includes('ws://127.0.0.1:*'));
  assert.ok(connectSrc.includes('http://localhost:*'));
  assert.ok(connectSrc.includes('ws://localhost:*'));
  assert.ok(connectSrc.includes('https://www.tooltician.com'));
  assert.ok(connectSrc.includes('https://api.tooltician.com'));
  assert.deepEqual(directives.get('img-src'), ["'self'", 'data:', 'blob:']);
  assert.deepEqual(directives.get('frame-ancestors'), ["'none'"]);
});

test('buildElectronDevCsp adds connect-src when a custom policy omits it', () => {
  const csp = buildElectronDevCsp({
    host: 'localhost',
    baseCsp: "default-src 'self'; style-src 'self' 'unsafe-inline'",
  });
  const directives = parseCsp(csp);

  assert.deepEqual(directives.get('style-src'), ["'self'", "'unsafe-inline'"]);
  assert.deepEqual(directives.get('connect-src'), getElectronDevConnectSrc('localhost'));
});

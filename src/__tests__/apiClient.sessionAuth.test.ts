import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getApiBaseUrlSync, requestApi, invalidateApiBaseUrlCache } from '../lib/apiClient.js';
import { mergeRuntimeConfig, setRuntimeConfigForTesting } from '../lib/runtimeConfig.js';

const originalFetch = global.fetch;

describe('apiClient session auth', () => {
  beforeEach(() => {
    setRuntimeConfigForTesting(null);
    invalidateApiBaseUrlCache();
    global.fetch = originalFetch;
  });

  afterEach(() => {
    setRuntimeConfigForTesting(null);
    invalidateApiBaseUrlCache();
    global.fetch = originalFetch;
  });

  it('adds the default desktop session header from runtime config', async () => {
    setRuntimeConfigForTesting({
      API_BASE_URL: 'https://runtime.example',
      API_SESSION_TOKEN: 'desktop-session-token',
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    global.fetch = fetchMock as unknown as typeof global.fetch;

    await requestApi('/monitoring');

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://runtime.example/api/v1/monitoring');
    const headers = new Headers(init?.headers);
    expect(headers.get('X-Session-Token')).toBe('desktop-session-token');
  });

  it('respects a custom session auth header and does not override explicit headers', async () => {
    setRuntimeConfigForTesting({
      API_BASE_URL: 'https://runtime.example',
      API_SESSION_TOKEN: 'desktop-session-token',
      SESSION_AUTH_HEADER: 'X-Desktop-Auth',
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    global.fetch = fetchMock as unknown as typeof global.fetch;

    await requestApi('/monitoring', {
      headers: {
        'X-Desktop-Auth': 'caller-supplied-token',
      },
    });

    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get('X-Desktop-Auth')).toBe('caller-supplied-token');
    expect(headers.get('X-Session-Token')).toBeNull();
  });

  it('refreshes the cached API base URL when runtime config changes after bootstrap', async () => {
    setRuntimeConfigForTesting({
      API_BASE_URL: 'https://bootstrap.example',
      SESSION_AUTH_HEADER: 'X-Desktop-Auth',
    });

    expect(getApiBaseUrlSync()).toBe('https://bootstrap.example');

    mergeRuntimeConfig({
      API_BASE_URL: 'https://unlocked.example',
      API_SESSION_TOKEN: 'desktop-session-token',
      ACTIVE_PORTFOLIO_ID: 'desktop',
    });

    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    global.fetch = fetchMock as unknown as typeof global.fetch;

    await requestApi('/portfolio/desktop');

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://unlocked.example/api/v1/portfolio/desktop');
    const headers = new Headers(init?.headers);
    expect(headers.get('X-Desktop-Auth')).toBe('desktop-session-token');
  });

  it('rejects absolute API paths before calling fetch', async () => {
    setRuntimeConfigForTesting({
      API_BASE_URL: 'https://runtime.example',
    });
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof global.fetch;

    await expect(requestApi('https://evil.example/monitoring')).rejects.toThrow(
      'API paths must be relative'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects unsupported base URL protocols before calling fetch', async () => {
    setRuntimeConfigForTesting({
      API_BASE_URL: 'file:///tmp/portfolio',
    });
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof global.fetch;

    await expect(requestApi('/monitoring')).rejects.toThrow('Unsupported API base URL protocol');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

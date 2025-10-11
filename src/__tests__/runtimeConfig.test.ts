import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadRuntimeConfig,
  getRuntimeConfigSync,
  setRuntimeConfigForTesting,
} from '../lib/runtimeConfig.js';
import {
  invalidateApiBaseUrlCache,
  resolveApiBaseUrl,
} from '../lib/apiClient.js';

const originalFetch = global.fetch;

describe('runtime configuration loader', () => {
  beforeEach(() => {
    setRuntimeConfigForTesting(null);
    invalidateApiBaseUrlCache();
    delete (window as typeof window & { __APP_CONFIG__?: unknown }).__APP_CONFIG__;
    global.fetch = originalFetch;
  });

  afterEach(() => {
    setRuntimeConfigForTesting(null);
    invalidateApiBaseUrlCache();
    delete (window as typeof window & { __APP_CONFIG__?: unknown }).__APP_CONFIG__;
    global.fetch = originalFetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('prefers inline window.__APP_CONFIG__ when present', async () => {
    (window as typeof window & { __APP_CONFIG__?: unknown }).__APP_CONFIG__ = {
      API_BASE_URL: 'https://inline.example',
      REQUEST_TIMEOUT_MS: 1234,
    };

    const config = await loadRuntimeConfig();

    expect(config).toMatchObject({
      API_BASE_URL: 'https://inline.example',
      REQUEST_TIMEOUT_MS: 1234,
    });
    expect(getRuntimeConfigSync()).toMatchObject({
      API_BASE_URL: 'https://inline.example',
      REQUEST_TIMEOUT_MS: 1234,
    });
  });

  it('falls back to config.json when inline config missing', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        API_BASE_URL: 'https://file.example',
        REQUEST_TIMEOUT_MS: 4321,
      }),
    });
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const config = await loadRuntimeConfig();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(config).toMatchObject({
      API_BASE_URL: 'https://file.example',
      REQUEST_TIMEOUT_MS: 4321,
    });
  });

  it('propagates runtime config into API base resolution', async () => {
    setRuntimeConfigForTesting({ API_BASE_URL: 'https://runtime.example' });
    invalidateApiBaseUrlCache();

    const baseUrl = await resolveApiBaseUrl();

    expect(baseUrl).toBe('https://runtime.example');
  });
});

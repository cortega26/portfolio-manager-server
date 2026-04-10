import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadRuntimeConfig,
  getRuntimeConfigSync,
  mergeRuntimeConfig,
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
      API_SESSION_TOKEN: 'desktop-inline-token',
      ACTIVE_PORTFOLIO_ID: 'desktop',
      REQUEST_TIMEOUT_MS: 1234,
      SESSION_AUTH_HEADER: 'X-Desktop-Auth',
      JOB_NIGHTLY_ACTIVE: false,
      JOB_NIGHTLY_HOUR_UTC: 4,
    };

    expect(getRuntimeConfigSync()).toMatchObject({
      API_BASE_URL: 'https://inline.example',
      API_SESSION_TOKEN: 'desktop-inline-token',
      ACTIVE_PORTFOLIO_ID: 'desktop',
      REQUEST_TIMEOUT_MS: 1234,
      SESSION_AUTH_HEADER: 'X-Desktop-Auth',
      JOB_NIGHTLY_ACTIVE: false,
      JOB_NIGHTLY_HOUR_UTC: 4,
    });

    const config = await loadRuntimeConfig();

    expect(config).toMatchObject({
      API_BASE_URL: 'https://inline.example',
      API_SESSION_TOKEN: 'desktop-inline-token',
      ACTIVE_PORTFOLIO_ID: 'desktop',
      REQUEST_TIMEOUT_MS: 1234,
      SESSION_AUTH_HEADER: 'X-Desktop-Auth',
      JOB_NIGHTLY_ACTIVE: false,
      JOB_NIGHTLY_HOUR_UTC: 4,
    });
    expect(getRuntimeConfigSync()).toMatchObject({
      API_BASE_URL: 'https://inline.example',
      API_SESSION_TOKEN: 'desktop-inline-token',
      ACTIVE_PORTFOLIO_ID: 'desktop',
      REQUEST_TIMEOUT_MS: 1234,
      SESSION_AUTH_HEADER: 'X-Desktop-Auth',
    });
  });

  it('falls back to config.json when inline config missing', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        API_BASE_URL: 'https://file.example',
        REQUEST_TIMEOUT_MS: 4321,
        JOB_NIGHTLY_ACTIVE: true,
        JOB_NIGHTLY_HOUR_UTC: 6,
      }),
    });
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const config = await loadRuntimeConfig();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(config).toMatchObject({
      API_BASE_URL: 'https://file.example',
      REQUEST_TIMEOUT_MS: 4321,
      JOB_NIGHTLY_ACTIVE: true,
      JOB_NIGHTLY_HOUR_UTC: 6,
    });
  });

  it('propagates runtime config into API base resolution', async () => {
    setRuntimeConfigForTesting({ API_BASE_URL: 'https://runtime.example' });
    invalidateApiBaseUrlCache();

    const baseUrl = await resolveApiBaseUrl();

    expect(baseUrl).toBe('https://runtime.example');
  });

  it('merges desktop unlock config into the active runtime state', () => {
    (window as typeof window & { __APP_CONFIG__?: unknown }).__APP_CONFIG__ = {
      API_BASE_URL: 'https://desktop.example',
      SESSION_AUTH_HEADER: 'X-Desktop-Auth',
      JOB_NIGHTLY_HOUR_UTC: 4,
    };

    const merged = mergeRuntimeConfig({
      API_SESSION_TOKEN: 'desktop-session-token',
      ACTIVE_PORTFOLIO_ID: 'desktop',
      JOB_NIGHTLY_ACTIVE: false,
    });

    expect(merged).toMatchObject({
      API_BASE_URL: 'https://desktop.example',
      API_SESSION_TOKEN: 'desktop-session-token',
      ACTIVE_PORTFOLIO_ID: 'desktop',
      SESSION_AUTH_HEADER: 'X-Desktop-Auth',
      JOB_NIGHTLY_ACTIVE: false,
      JOB_NIGHTLY_HOUR_UTC: 4,
    });
    expect(getRuntimeConfigSync()).toMatchObject({
      API_BASE_URL: 'https://desktop.example',
      API_SESSION_TOKEN: 'desktop-session-token',
      ACTIVE_PORTFOLIO_ID: 'desktop',
      SESSION_AUTH_HEADER: 'X-Desktop-Auth',
      JOB_NIGHTLY_ACTIVE: false,
      JOB_NIGHTLY_HOUR_UTC: 4,
    });
  });
});

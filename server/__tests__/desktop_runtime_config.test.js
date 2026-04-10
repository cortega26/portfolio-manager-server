import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDesktopRuntimeConfigArg,
  buildDesktopRuntimeConfig,
  decodeDesktopRuntimeConfig,
  DESKTOP_RUNTIME_CONFIG_ARG_PREFIX,
  DESKTOP_RUNTIME_CONFIG_ENV,
  encodeDesktopRuntimeConfig,
  readDesktopRuntimeConfigFromArgv,
  readDesktopRuntimeConfigFromEnv,
} from "../../electron/runtimeConfig.js";

test("desktop runtime config round-trips through environment encoding", () => {
  const config = buildDesktopRuntimeConfig({
    apiBaseUrl: "http://127.0.0.1:43123",
    sessionToken: "desktop-session-token",
    activePortfolioId: "desktop",
    sessionAuthHeader: "X-Desktop-Auth",
    requestTimeoutMs: 9000,
    jobNightlyActive: false,
    jobNightlyHourUtc: 4,
  });

  const encoded = encodeDesktopRuntimeConfig(config);
  const decoded = decodeDesktopRuntimeConfig(encoded);

  assert.deepEqual(decoded, {
    API_BASE_URL: "http://127.0.0.1:43123",
    API_SESSION_TOKEN: "desktop-session-token",
    ACTIVE_PORTFOLIO_ID: "desktop",
    SESSION_AUTH_HEADER: "X-Desktop-Auth",
    REQUEST_TIMEOUT_MS: 9000,
    JOB_NIGHTLY_ACTIVE: false,
    JOB_NIGHTLY_HOUR_UTC: 4,
  });
});

test("desktop runtime config ignores invalid fields from the environment", () => {
  const config = readDesktopRuntimeConfigFromEnv({
    [DESKTOP_RUNTIME_CONFIG_ENV]: encodeDesktopRuntimeConfig({
      API_BASE_URL: "  ",
      API_SESSION_TOKEN: " desktop-session-token ",
      ACTIVE_PORTFOLIO_ID: " desktop ",
      SESSION_AUTH_HEADER: "",
      REQUEST_TIMEOUT_MS: -100,
      JOB_NIGHTLY_ACTIVE: false,
      JOB_NIGHTLY_HOUR_UTC: 26,
    }),
  });

  assert.deepEqual(config, {
    API_SESSION_TOKEN: "desktop-session-token",
    ACTIVE_PORTFOLIO_ID: "desktop",
    JOB_NIGHTLY_ACTIVE: false,
  });
});

test("desktop runtime config round-trips through BrowserWindow additional arguments", () => {
  const config = buildDesktopRuntimeConfig({
    apiBaseUrl: "http://127.0.0.1:43123",
    sessionToken: "desktop-session-token",
    activePortfolioId: "desktop",
    sessionAuthHeader: "X-Desktop-Auth",
    requestTimeoutMs: 9000,
    jobNightlyActive: false,
    jobNightlyHourUtc: 4,
  });

  const runtimeArg = buildDesktopRuntimeConfigArg(config);

  assert.match(runtimeArg, new RegExp(`^${DESKTOP_RUNTIME_CONFIG_ARG_PREFIX}`));
  assert.deepEqual(readDesktopRuntimeConfigFromArgv(["electron", ".", runtimeArg]), {
    API_BASE_URL: "http://127.0.0.1:43123",
    API_SESSION_TOKEN: "desktop-session-token",
    ACTIVE_PORTFOLIO_ID: "desktop",
    SESSION_AUTH_HEADER: "X-Desktop-Auth",
    REQUEST_TIMEOUT_MS: 9000,
    JOB_NIGHTLY_ACTIVE: false,
    JOB_NIGHTLY_HOUR_UTC: 4,
  });
});

import { createApp } from "../app.js";

export const TEST_SESSION_TOKEN = "desktop-session-token";
export const TEST_SESSION_HEADER = "X-Session-Token";

function mergeSessionConfig(config = {}) {
  const baseConfig = {
    featureFlags: { cashBenchmarks: true },
    cors: { allowedOrigins: [] },
    security: {
      auth: {
        sessionToken: TEST_SESSION_TOKEN,
        headerName: TEST_SESSION_HEADER,
      },
    },
  };

  return {
    ...baseConfig,
    ...config,
    featureFlags: {
      ...baseConfig.featureFlags,
      ...(config.featureFlags ?? {}),
    },
    cors: {
      ...baseConfig.cors,
      ...(config.cors ?? {}),
    },
    security: {
      ...baseConfig.security,
      ...(config.security ?? {}),
      auth: {
        ...baseConfig.security.auth,
        ...(config.security?.auth ?? {}),
      },
    },
  };
}

export function createSessionTestApp({ config = {}, ...options } = {}) {
  return createApp({
    ...options,
    config: mergeSessionConfig(config),
  });
}

export function withSession(
  requestBuilder,
  token = TEST_SESSION_TOKEN,
  headerName = TEST_SESSION_HEADER,
) {
  return requestBuilder.set(headerName, token);
}

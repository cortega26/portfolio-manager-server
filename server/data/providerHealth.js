const DEFAULT_POLICY = Object.freeze({
  transientFailureThreshold: 2,
  transientCooldownMs: 2 * 60 * 1000,
  authFailureThreshold: 1,
  authCooldownMs: 30 * 60 * 1000,
});

function resolveStatusCode(error) {
  if (Number.isFinite(error?.statusCode)) {
    return Number(error.statusCode);
  }
  if (Number.isFinite(error?.status)) {
    return Number(error.status);
  }
  return null;
}

function classifyFailure(error) {
  if (
    error?.code === "PRICE_NOT_FOUND"
    || error?.code === "PRICE_SYMBOL_UNSUPPORTED"
  ) {
    return null;
  }
  if (error?.code === "PRICE_PROVIDER_MISCONFIGURED") {
    return "auth";
  }
  const statusCode = resolveStatusCode(error);
  if (
    Number.isFinite(statusCode)
    && statusCode >= 400
    && statusCode < 500
    && statusCode !== 408
    && statusCode !== 429
  ) {
    return "auth";
  }
  return "transient";
}

function normalizeLogger(logger) {
  if (!logger) {
    return null;
  }
  if (typeof logger.child === "function") {
    return logger;
  }
  return {
    info(message, meta = {}) {
      logger.info?.(message, meta);
    },
    warn(message, meta = {}) {
      logger.warn?.(message, meta);
    },
    error(message, meta = {}) {
      logger.error?.(message, meta);
    },
    child() {
      return normalizeLogger(logger);
    },
  };
}

export function createProviderHealthMonitor({
  logger = null,
  now = () => Date.now(),
  policy = {},
} = {}) {
  const resolvedLogger = normalizeLogger(logger);
  const resolvedPolicy = {
    ...DEFAULT_POLICY,
    ...(policy && typeof policy === "object" ? policy : {}),
  };
  const stateByProvider = new Map();

  function getState(providerKey) {
    const normalizedKey = String(providerKey ?? "").trim().toLowerCase();
    const current =
      stateByProvider.get(normalizedKey)
      ?? {
        key: normalizedKey,
        failureCount: 0,
        lastFailureKind: null,
        lastFailureAt: null,
        lastErrorMessage: null,
        unhealthyUntil: 0,
      };
    stateByProvider.set(normalizedKey, current);
    return current;
  }

  function isHealthy(providerKey) {
    const state = getState(providerKey);
    return state.unhealthyUntil <= now();
  }

  function getAvailability(providerKey) {
    const state = getState(providerKey);
    return {
      healthy: state.unhealthyUntil <= now(),
      unhealthyUntil: state.unhealthyUntil,
      lastFailureKind: state.lastFailureKind,
      lastFailureAt: state.lastFailureAt,
      lastErrorMessage: state.lastErrorMessage,
    };
  }

  function markUnhealthy(providerKey, failureKind, error) {
    const state = getState(providerKey);
    const cooldownMs =
      failureKind === "auth"
        ? resolvedPolicy.authCooldownMs
        : resolvedPolicy.transientCooldownMs;
    state.unhealthyUntil = now() + cooldownMs;
    state.lastFailureKind = failureKind;
    state.lastFailureAt = new Date(now()).toISOString();
    state.lastErrorMessage =
      typeof error?.message === "string" && error.message.trim().length > 0
        ? error.message.trim()
        : null;
    resolvedLogger?.warn?.("price_provider_marked_unhealthy", {
      provider: state.key,
      failure_kind: failureKind,
      unhealthy_until: new Date(state.unhealthyUntil).toISOString(),
      error: state.lastErrorMessage,
    });
  }

  return {
    isHealthy,
    getAvailability,
    recordSuccess(providerKey) {
      const state = getState(providerKey);
      const wasUnhealthy = state.unhealthyUntil > now();
      state.failureCount = 0;
      state.lastFailureKind = null;
      state.lastFailureAt = null;
      state.lastErrorMessage = null;
      state.unhealthyUntil = 0;
      if (wasUnhealthy) {
        resolvedLogger?.info?.("price_provider_recovered", {
          provider: state.key,
        });
      }
    },
    recordFailure(providerKey, error) {
      const state = getState(providerKey);
      const failureKind = classifyFailure(error);
      if (!failureKind) {
        return;
      }
      state.failureCount += 1;
      state.lastFailureKind = failureKind;
      state.lastFailureAt = new Date(now()).toISOString();
      state.lastErrorMessage =
        typeof error?.message === "string" && error.message.trim().length > 0
          ? error.message.trim()
          : null;
      const threshold =
        failureKind === "auth"
          ? resolvedPolicy.authFailureThreshold
          : resolvedPolicy.transientFailureThreshold;
      if (state.failureCount >= threshold) {
        markUnhealthy(state.key, failureKind, error);
      }
    },
    logSkip(providerKey, context = {}) {
      const state = getState(providerKey);
      resolvedLogger?.warn?.("price_provider_skipped_unhealthy", {
        provider: state.key,
        unhealthy_until:
          state.unhealthyUntil > 0 ? new Date(state.unhealthyUntil).toISOString() : null,
        last_failure_kind: state.lastFailureKind,
        ...context,
      });
    },
  };
}

export default createProviderHealthMonitor;

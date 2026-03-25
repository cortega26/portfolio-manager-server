import { timingSafeEqual } from "crypto";

export const DEFAULT_SESSION_AUTH_HEADER = "x-session-token";

function normalizeSecret(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "";
}

function normalizeHeaderName(value) {
  const normalized = normalizeSecret(value).toLowerCase();
  return normalized || DEFAULT_SESSION_AUTH_HEADER;
}

function createSessionAuthError({
  status,
  code,
  message,
  expose = true,
}) {
  const error = new Error(message);
  error.status = status;
  error.statusCode = status;
  error.code = code;
  error.expose = expose;
  return error;
}

function tokensEqual(providedToken, expectedToken) {
  const providedBuffer = Buffer.from(providedToken, "utf8");
  const expectedBuffer = Buffer.from(expectedToken, "utf8");
  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(providedBuffer, expectedBuffer);
}

export function createSessionAuth({
  sessionToken,
  headerName = DEFAULT_SESSION_AUTH_HEADER,
  logger = null,
} = {}) {
  const normalizedToken = normalizeSecret(sessionToken);
  const normalizedHeaderName = normalizeHeaderName(headerName);

  function buildAuditPayload(req, details = {}) {
    const portfolioId =
      typeof req?.params?.id === "string" && req.params.id.trim().length > 0
        ? req.params.id.trim()
        : undefined;
    return portfolioId ? { portfolio_id: portfolioId, ...details } : details;
  }

  return function sessionAuth(req, _res, next) {
    if (!normalizedToken) {
      if (typeof logger?.error === "function") {
        logger.error("session_auth_misconfigured", {
          header_name: normalizedHeaderName,
        });
      }
      if (typeof req.auditLog === "function") {
        req.auditLog(
          "auth_failed",
          buildAuditPayload(req, { reason: "session_auth_misconfigured" }),
        );
      }
      next(
        createSessionAuthError({
          status: 500,
          code: "SESSION_AUTH_MISCONFIGURED",
          message: "Desktop session authentication is not configured.",
          expose: false,
        }),
      );
      return;
    }

    const providedToken = normalizeSecret(req.get(normalizedHeaderName));
    if (!providedToken) {
      if (typeof req.auditLog === "function") {
        req.auditLog(
          "auth_failed",
          buildAuditPayload(req, { reason: "missing_session_token" }),
        );
      }
      next(
        createSessionAuthError({
          status: 401,
          code: "NO_SESSION_TOKEN",
          message: "Session token required.",
        }),
      );
      return;
    }

    if (!tokensEqual(providedToken, normalizedToken)) {
      if (typeof req.auditLog === "function") {
        req.auditLog(
          "auth_failed",
          buildAuditPayload(req, { reason: "invalid_session_token" }),
        );
      }
      next(
        createSessionAuthError({
          status: 403,
          code: "INVALID_SESSION_TOKEN",
          message: "Invalid session token.",
        }),
      );
      return;
    }

    req.portfolioAuth = {
      ...(req.portfolioAuth ?? {}),
      mode: "session",
      headerName: normalizedHeaderName,
    };
    if (typeof req.auditLog === "function") {
      req.auditLog(
        "auth_success",
        buildAuditPayload(req, { mode: "session" }),
      );
    }
    next();
  };
}

export default createSessionAuth;

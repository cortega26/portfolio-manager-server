// @ts-nocheck
import { randomUUID } from "crypto";

export function attachRequestId(req, res, next) {
  const headerRequestId =
    typeof req.get === "function"
      ? req.get("X-Request-ID")
      : req.headers?.["x-request-id"];
  const normalizedRequestId =
    typeof headerRequestId === "string"
      ? headerRequestId.trim().slice(0, 128)
      : "";
  if (normalizedRequestId.length > 0) {
    req.id = normalizedRequestId;
  } else if (typeof req.id !== "string" || req.id.length === 0) {
    req.id = randomUUID();
  }
  res.setHeader("X-Request-ID", req.id);
  res.locals.requestId = req.id;
  next();
}

export function rewriteLegacyApiPrefix(req, res, next) {
  if (!(req.originalUrl && req.originalUrl.startsWith("/api/v1"))) {
    next();
    return;
  }
  const rewrittenUrl = req.url.replace(/^\/api\/v1(?=\/|$)/u, "/api");
  req.url = rewrittenUrl.length === 0 ? "/api" : rewrittenUrl;
  req.originalUrl = req.originalUrl.replace(/^\/api\/v1(?=\/|$)/u, "/api");
  res.locals.apiVersion = "v1";
  res.setHeader("X-API-Version", "v1");
  next();
}

export function ensureApiVersionHeader(req, res, next) {
  if (!res.locals.apiVersion) {
    res.locals.apiVersion = "legacy";
    res.setHeader(
      "Warning",
      '299 - "Legacy API path /api is deprecated; migrate to /api/v1"',
    );
    res.setHeader("X-API-Version", "legacy");
  } else if (!res.getHeader("X-API-Version")) {
    res.setHeader("X-API-Version", res.locals.apiVersion);
  }
  next();
}

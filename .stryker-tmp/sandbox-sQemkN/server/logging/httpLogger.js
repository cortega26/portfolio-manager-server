// @ts-nocheck
import { randomUUID } from "crypto";
import pinoHttp from "pino-http";

export const SENSITIVE_HEADER_PATHS = [
  'req.headers["x-portfolio-key"]',
  'req.headers["x-portfolio-key-new"]',
];

export const HTTP_LOG_REDACT_CONFIG = {
  paths: SENSITIVE_HEADER_PATHS,
  censor: "[REDACTED]",
};

export function buildHttpLoggerOptions(baseLogger = null) {
  return {
    logger: baseLogger ?? undefined,
    redact: HTTP_LOG_REDACT_CONFIG,
    genReqId(req) {
      return req.headers["x-request-id"] ?? randomUUID();
    },
    customSuccessMessage() {
      return "request_complete";
    },
    customErrorMessage() {
      return "request_error";
    },
  };
}

export function createHttpLogger({
  logger = null,
  factory = null,
} = {}) {
  const options = buildHttpLoggerOptions(logger);
  if (typeof factory === "function") {
    return factory(options);
  }
  return pinoHttp(options);
}

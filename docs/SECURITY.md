<!-- markdownlint-disable -->

# Security Hardening Guide

This document complements the audit deliverables and the README user guide. It captures the
security controls that already ship with the portfolio manager, explains how to operate them
safely, and outlines incident-response playbooks for on-call engineers.

## Security Principles & Best Practices

- **Least privilege API keys** – Every portfolio is isolated behind a hashed API key. Never reuse
  keys across portfolios and rotate keys regularly (see below).
- **Strong credential policy** – The backend enforces the Zod schema defined in
  `server/middleware/validation.js` and `shared/apiKey.js` requiring 12+ characters with upper,
  lower, numeric, and special characters. Client-side validation mirrors the same rules.
- **Progressive brute-force lockouts** – `server/middleware/bruteForce.js` tracks failures by
  portfolio + IP. After repeated failures requests are blocked with exponential back-off as
  configured via `BRUTE_FORCE_*` variables.
- **Structured audit logging** – `server/middleware/auditLog.js` emits normalized security events
  (see the reference table below) via the shared Pino logger so logs can be streamed to your SIEM.
- **Strict validation everywhere** – All request bodies and query parameters flow through Zod
  schemas to prevent injection, oversized payloads, or schema drift.
- **Secure defaults** – Helmet, compression, strict CORS, HSTS, and JSON size limits ship enabled by
  default. Review `server/config.js` before loosening any guardrails.
- **Immutable storage semantics** – Persistence relies on atomic writes, per-portfolio mutexes, and
  idempotent transaction identifiers to avoid race conditions or data corruption during incidents.

## API Key Management

### Strength requirements

Keys must satisfy the shared evaluator exported from `shared/apiKey.js`:

- At least 12 characters long
- Contains at least one uppercase character (`A-Z`)
- Contains at least one lowercase character (`a-z`)
- Contains at least one number (`0-9`)
- Contains at least one special character (`!@#$%^&*`)

Use the helper in the shared module to surface progress indicators in admin tooling:

```js
import { evaluateApiKeyRequirements, isApiKeyStrong } from '../shared/apiKey.js';

const checks = evaluateApiKeyRequirements(candidateKey);
const strongEnough = isApiKeyStrong(candidateKey);
```

### Rotation procedure

1. Load the portfolio with the current key.
2. Generate a new strong key that satisfies all requirements.
3. Submit a save request with both headers set:
   - `X-Portfolio-Key`: current key
   - `X-Portfolio-Key-New`: new key
4. Confirm the API returns `200 OK` and the audit log records a `key_rotated` event.
5. Update any automated clients to send the new key only.

### Revocation checklist

- Revoke compromised keys immediately by rotating with a new key.
- Inspect audit logs for `auth_failed` and `rate_limit_exceeded` events originating from suspicious
  IP ranges.
- If the attacker accessed data, follow the incident response plan below and notify impacted users.

## Incident Response Runbooks

### 1. Multiple failed authentications

1. Tail the backend logs filtered by `event_type: security`.
2. Locate repeated `auth_failed` events for the affected portfolio ID or IP address.
3. Check the security stats endpoint (`GET /api/security/stats`) or the Admin dashboard lockout table
   for active lockouts.
4. If lockouts continue, temporarily raise the lockout duration via environment overrides and block
   the offending IP at the proxy or firewall.
5. Rotate the portfolio API key after verifying the legitimate owner still has access.

### 2. Suspicious key rotation

1. Search for `key_rotated` events and confirm the `user_agent` and `ip` fields are expected.
2. If the rotation was unauthorized, immediately rotate to a trusted key and notify the portfolio
   owner.
3. Review preceding `auth_failed` or `rate_limit_exceeded` events to assess possible brute-force
   attempts.
4. Document the incident in the shared response tracker and evaluate whether additional monitoring
   thresholds should be tuned.

### 3. Rate limit saturation

1. Inspect `rate_limit_exceeded` events to identify the offending route and IP.
2. Correlate with `req.log` output (the security audit middleware attaches the structured payload to
   the request logger) to gather request context.
3. Mitigate by tightening rate limits at the edge or enabling upstream WAF rules.
4. Capture metrics for long-term monitoring using `/api/v1/monitoring`
   (OBS-1 is complete) to confirm cache hit ratios and limiter pressure.

## Security Event Reference

| Event name             | Triggered when…                                                        | Core payload fields                                                                 |
|------------------------|------------------------------------------------------------------------|--------------------------------------------------------------------------------------|
| `auth_success`         | Authentication succeeds with a valid key                               | `portfolio_id`, `ip`, `user_agent`, `request_id`                                    |
| `auth_failed`          | A request supplies an invalid or missing key                            | `portfolio_id`, `ip`, `user_agent`, `request_id`, `reason`                          |
| `weak_key_rejected`    | Validation rejects a key that fails strength requirements               | `portfolio_id`, `ip`, `requirements`                                                |
| `key_rotated`          | Portfolio key rotation completes successfully                           | `portfolio_id`, `ip`, `user_agent`, `request_id`                                    |
| `rate_limit_exceeded`  | A request is blocked by the rate limiter                                | `portfolio_id`, `ip`, `route`, `limit`, `windowSeconds`                             |

All events include `event_type: 'security'` and an ISO 8601 `timestamp`. When the incoming request
provides an `X-Request-ID` header, it is copied into `request_id`; otherwise the middleware falls
back to the Express request identifier.

### Exporting audit trails

From the Admin tab, select **Export security events CSV** to download the current audit buffer. The
file contains one row per event with timestamp, event name, portfolio ID, IP, user agent, request ID,
and a JSON-encoded metadata column mirroring the payload listed above.

## Security Configuration Reference

| Name                                   | Type    | Default | Required | Description |
|----------------------------------------|---------|---------|----------|-------------|
| `NODE_ENV`                             | string  | development | yes | Runtime mode for configuration branching |
| `PORT`                                 | number  | 3000    | yes      | Express server port |
| `DATA_DIR`                             | string  | ./data  | yes      | Directory for persisted portfolios |
| `CORS_ALLOWED_ORIGINS`                 | string  | [] (configure)<br />Dev: http://localhost:5173,http://localhost:4173 | yes | Comma-delimited list of allowed origins |
| `FEATURES_CASH_BENCHMARKS`             | boolean | true    | yes      | Exposes benchmark + cash endpoints |
| `API_CACHE_TTL_SECONDS`                | number  | 600     | yes      | TTL for API cache responses |
| `PRICE_CACHE_TTL_SECONDS`              | number  | 600     | yes      | TTL for price cache entries |
| `PRICE_CACHE_CHECK_PERIOD`             | number  | 120     | yes      | Frequency (seconds) to prune expired cache entries |
| `PRICE_FETCH_TIMEOUT_MS`               | number  | 5000    | yes      | Upstream price fetch timeout |
| `FRESHNESS_MAX_STALE_TRADING_DAYS`     | number  | 3       | yes      | Maximum tolerated trading-day staleness before 503 |
| `BRUTE_FORCE_MAX_ATTEMPTS`             | number  | 5       | yes      | Maximum failures before lockout |
| `BRUTE_FORCE_ATTEMPT_WINDOW_SECONDS`   | number  | 900     | yes      | Sliding window used to count failures |
| `BRUTE_FORCE_LOCKOUT_SECONDS`          | number  | 900     | yes      | Base lockout duration before multiplier |
| `BRUTE_FORCE_MAX_LOCKOUT_SECONDS`      | number  | 3600    | yes      | Upper bound for exponential lockouts |
| `BRUTE_FORCE_LOCKOUT_MULTIPLIER`       | number  | 2       | yes      | Exponential backoff multiplier for repeated lockouts |
| `BRUTE_FORCE_CHECK_PERIOD`             | number  | 60      | yes      | Interval for sweeping expired brute force entries |
| `RATE_LIMIT_GENERAL_WINDOW_MS`         | number  | 60000   | yes      | Rolling window (ms) for general request limiter |
| `RATE_LIMIT_GENERAL_MAX`               | number  | 100     | yes      | Requests allowed per window for general scope |
| `RATE_LIMIT_PORTFOLIO_WINDOW_MS`       | number  | 60000   | yes      | Portfolio limiter window (ms) |
| `RATE_LIMIT_PORTFOLIO_MAX`             | number  | 20      | yes      | Requests allowed per window for portfolio scope |
| `RATE_LIMIT_PRICES_WINDOW_MS`          | number  | 60000   | yes      | Price lookup limiter window (ms) |
| `RATE_LIMIT_PRICES_MAX`                | number  | 60      | yes      | Requests allowed per window for price scope |
| `SECURITY_AUDIT_MAX_EVENTS`            | number  | 200     | no       | Maximum security audit events retained in memory for the Admin dashboard and `/api/security/events`. |
| `LOG_LEVEL`                            | string  | info    | no       | Pino logger level |
| `JOB_NIGHTLY_HOUR`                     | number  | 4       | no       | Hour of day to run nightly freshness job |
| `VITE_API_BASE`                        | string  | http://localhost:3000 | no       | Frontend override for API origin |

> ℹ️ **Production hardening:** terminate TLS at the load balancer or reverse proxy, enable WAF rules,
> and stream the Pino logs to your centralized logging stack with retention appropriate for your
> compliance program.

## External Penetration Test Assessment (2025-02)

An external consultant delivered an eight-item high priority report. The table below records whether
each item reproduces against the current hardened build and the concrete remediation actions we will
pursue. All confirmed items are tracked in the backlog with owners and due dates; “Not Reproduced”
items gain regression tests or documentation updates to prevent future confusion.

| Issue | Status | Findings | Action Plan |
|-------|--------|----------|-------------|
| No request signing / integrity verification | ❌ Confirmed gap | Authentication relies on a hashed `X-Portfolio-Key`, but replay protection and per-request integrity guarantees are not enforced. | Design a canonical request payload (method, path, timestamp, body hash) and require an `X-Portfolio-Signature` HMAC generated with the portfolio key. Add a ±5 minute timestamp tolerance, reject replays via nonce cache, update `shared/api.js` helpers, and cover success/error paths in API integration tests and Playwright smoke flows. Document rollout + rotation guidance in README/SECURITY. |
| Missing critical security headers | ✅ Not reproduced | `server/app.js` boots Helmet with CSP, HSTS, frame-guard, referrer policy, and XSS protections already verified in regression suites. | Add an automated header snapshot test (Vitest + Supertest) to guard the Helmet configuration and document required headers for reverse proxies. |
| Sensitive data in logs | ❌ Confirmed gap | `pino-http` currently serializes full request headers, exposing `X-Portfolio-Key`/`X-Portfolio-Key-New` in structured logs. | Enable `redact` for sensitive headers and any body fields holding credentials, expand the audit logger to strip key material before emitting events, and add unit tests asserting the redaction plus a log sanitization section in SECURITY.md. |
| No HTTPS enforcement | ❌ Confirmed gap (by design) | Production guidance mandates TLS termination, but the Express app does not actively redirect HTTP or enforce HSTS when `NODE_ENV=production`. | Introduce an opt-in `ENFORCE_HTTPS=true` environment flag that rejects non-TLS requests when `trust proxy` is enabled, ensure Helmet’s HSTS is only skipped for local development, and document proxy configuration and staging rollout steps. |
| Error messages leak implementation details | ✅ Not reproduced | The error handler maps server exceptions to `INTERNAL_ERROR` with generic messaging for 5xx responses and hides stack traces from clients. | Backfill contract tests asserting sanitized 4xx/5xx payloads and lint future middleware to set `error.expose` intentionally. |
| No API versioning | ✅ Not reproduced | All REST routes mount beneath `/api/v1`, clients ship with explicit base URLs, and contract tests enforce the prefix. | Add a canary test to ensure no new routes register outside `/api/v1` and update the API gateway checklist to require version bumps for breaking changes. |
| Poor session management | ✅ Not applicable | The API is stateless and uses per-portfolio API keys instead of cookie-based sessions; there is no server-side session layer to harden. | Clarify in README + Admin docs that API keys function as bearer credentials, emphasize rotation cadence, and expand brute-force monitoring dashboards. |
| Audit logs only in memory | ❌ Confirmed gap | The security event buffer caps at `SECURITY_AUDIT_MAX_EVENTS` in memory; while events stream to Pino, they are not persisted durably by default. | Add a pluggable event sink that writes NDJSON to `DATA_DIR/security/` (with rotation + backpressure) and supports webhook/queue forwarders. Provide operational docs for shipping the log files to external SIEM storage and add tests covering persistence & rollover. |

## Monitoring & Open Items

- ✅ **Rate limit monitoring (SEC-12)** – `/api/security/stats` exposes limiter hit totals, rolling windows,
  unique offender counts, and top offenders for each scope. Connect these fields to Prometheus/Grafana to
  add alerting thresholds.
- ✅ **Performance monitoring endpoint (OBS-1)** – `/api/monitoring` reports cache hit ratios,
  lock metrics (active + queued), brute-force lockouts, and rate limiter telemetry for dashboards.
- ✅ **Request ID middleware (OBS-3)** – The Pino adapter assigns UUIDs per request and echoes
  `X-Request-ID` headers for downstream correlation. The client helpers now pass
  those IDs back to the Admin dashboard and error toasts so operations teams can
  copy/paste trace IDs without digging through developer tools.
- ✅ **Admin dashboard (OBS-2)** – React admin tab visualises `/api/monitoring`, `/api/security/stats`,
  and `/api/security/events` data so operators can triage issues without hitting the API manually.
  Pricing freshness surfaces through the nightly `stale_price` flag and the security events panel can
  be exported to CSV for investigations or compliance hand-offs.
- ✅ **Codebase cleanup (CODE-1, CODE-2)** – Refactors merged on `main`; continue
  running complexity checks to guard against regressions.

## Further Reading

- [README.md](../README.md) – User guide and quick start instructions
- [docs/cash-benchmarks.md](./cash-benchmarks.md) – Financial modeling policies
- [docs/HARDENING_SCOREBOARD.md](./HARDENING_SCOREBOARD.md) – Up-to-date implementation status

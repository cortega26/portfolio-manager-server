<!-- markdownlint-disable -->

# Security Hardening Scoreboard

Last Updated: 2025-10-07 (synced after full repo audit)

Verification 2025-10-07: Reviewed `AI_IMPLEMENTATION_PROMPT.md` items and confirmed
P1-DOC-1 through P1-DX-1 remain satisfied (README onboarding, API key validation,
audit logging middleware, `.env.example` template), with no new unchecked tasks.

## Phase 1 — Immediate Priorities

| ID        | Title                               | Status (TODO/IN PROGRESS/DONE/BLOCKED) | Branch | PR | Evidence (CI/logs/coverage) | Notes |
|-----------|-------------------------------------|----------------------------------------|--------|----|-----------------------------|-------|
| P1-DOC-1  | Enhanced user guide in README       | DONE                                   | main   | —  | README.md §Getting Started, API Key Setup, Troubleshooting | Step-by-step onboarding, troubleshooting, and usage examples adapted from audit Section 6. |
| P1-DOC-2  | Security documentation (SECURITY.md) | DONE                                   | main   | —  | docs/SECURITY.md (API key policy, incident response) | Includes structured logging reference and configuration table. |
| P1-SEC-1  | API key strength enforcement         | DONE                                   | main   | —  | server/middleware/validation.js; shared/apiKey.js; server/__tests__/api_errors.test.js | Zod schema enforces min length + character classes, mirrored in shared evaluator and tests. |
| P1-SEC-2  | Security audit logging middleware    | DONE                                   | main   | —  | server/middleware/auditLog.js; server/__tests__/audit_log.test.js | req.auditLog emits structured events (auth_success/failed, key_rotated, weak_key_rejected). |
| P1-DX-1   | Environment template (.env.example)  | DONE                                   | main   | —  | .env.example; README.md environment configuration section | Template grouped by category with safe defaults and README guidance. |
| P1-SEC-3  | Enhanced brute force protection      | DONE                                   | main   | —  | server/middleware/bruteForce.js; server/__tests__/bruteForce.test.js | Progressive lockouts configurable via BRUTE_FORCE_* variables. |
| P1-TEST-1 | Security event logging tests         | DONE                                   | main   | —  | server/__tests__/audit_log.test.js | Ensures weak-key rejection and auth failure events are logged. |
| P1-TEST-2 | Security validation tests            | DONE                                   | main   | —  | server/__tests__/api_errors.test.js; server/__tests__/api_validation.test.js | Covers weak key errors and schema enforcement. |

## Phase 2 — Documentation Updates

| ID        | Title                                  | Status (TODO/IN PROGRESS/DONE/BLOCKED) | Branch | PR | Evidence (CI/logs/coverage) | Notes |
|-----------|----------------------------------------|----------------------------------------|--------|----|-----------------------------|-------|
| P2-DOC-1  | README deep-dive sections              | DONE                                   | main   | —  | README.md (§Usage Examples, §Monitoring) | Deep-dive walkthroughs and troubleshooting guidance in place. |
| P2-DOC-2  | HARDENING_SCOREBOARD sync process      | DONE                                   | main   | —  | docs/HARDENING_SCOREBOARD.md | Board kept in lockstep with AI_IMPLEMENTATION_PROMPT.md requirements. |
| P2-DOC-3  | OpenAPI error codes (WEAK_KEY, etc.)   | DONE                                   | main   | —  | docs/openapi.yaml (ErrorResponse schema) | Error payloads and WEAK_KEY response documented. |
| P2-DOC-4  | AGENTS.md roadmap refresh              | DONE                                   | main   | —  | AGENTS.md §§4-6 | Roadmap + workflows synchronized with scoreboard/README instructions. |

## Phase 2 — Platform Hardening (Short-term)

| ID         | Title                         | Status (TODO/IN PROGRESS/DONE/BLOCKED) | Branch | PR | Evidence (CI/logs/coverage) | Notes |
|------------|-------------------------------|----------------------------------------|--------|----|-----------------------------|-------|
| P2-PERF-1  | Price data caching            | DONE                                   | main   | —  | server/cache/priceCache.js; server/__tests__/priceCache.test.js; server/metrics/performanceMetrics.js | In-memory cache with TTL and metrics surfaced via /api/monitoring. |
| P2-PERF-2  | Response compression          | DONE                                   | main   | —  | server/app.js (compression middleware); server/__tests__/compression.test.js | Gzip compression enabled with opt-out header coverage. |
| P2-PERF-3  | Bundle optimization           | DONE                                   | main   | —  | vite.config.js (manualChunks, visualizer flag) | Rollup chunking + ANALYZE flag keep bundle sizes transparent. |
| P2-SEC-4   | Enhanced brute force telemetry | DONE                                   | main   | —  | server/middleware/bruteForce.js; server/metrics/performanceMetrics.js; server/__tests__/bruteForce.test.js | Lockout stats exported for monitoring dashboards. |
| P2-SEC-5   | Rate limit monitoring         | DONE                                   | main   | —  | server/metrics/rateLimitMetrics.js; server/__tests__/rate_limit_monitoring.test.js; server/__tests__/monitoring_endpoint.test.js | Offender tracking + metrics exposed under /api/monitoring. |

## Phase 3 — Observability & Future Work

| ID        | Title                           | Status (TODO/IN PROGRESS/DONE/BLOCKED) | Branch | PR | Evidence (CI/logs/coverage) | Notes |
|-----------|---------------------------------|----------------------------------------|--------|----|-----------------------------|-------|
| OBS-1     | Performance monitoring endpoint | DONE                                   | main   | —  | server/app.js (/api/monitoring); server/metrics/performanceMetrics.js; server/__tests__/monitoring_endpoint.test.js | Returns cache, rate limit, brute force, and lock stats for ops dashboards. |
| OBS-2     | Admin dashboard                 | DONE                                   | feat/obs-2-admin-dashboard | —  | server/security/eventsStore.js; server/__tests__/security_events.test.js; server/__tests__/events_store.test.js; src/components/AdminTab.jsx; src/__tests__/AdminTab.test.jsx | React admin tab renders monitoring/security data, backend event store enforces limits, new tests cover buffer handling and UI wiring; docs + env template refreshed. |
| OBS-3     | Request ID tracking middleware  | DONE                                   | main   | —  | server/app.js (pinoHttp genReqId); server/__tests__/audit_log.test.js | Pino assigns UUIDs per request and propagates to audit logs. |
| CODE-1    | Complex function refactoring    | TODO                                   | —      | —  | — | Large handlers (e.g., server/app.js) still exceed preferred complexity; refactor pending. |
| CODE-2    | Magic numbers extraction        | DONE                                   | fix/code-2-magic-numbers | —  | shared/constants.js; server/app.js; server/config.js; server/middleware/validation.js; src/utils/portfolioSchema.js | Rate limit + transaction caps centralized in shared constants and consumed across backend/frontend. |

> Historical scoreboard snapshots remain available in git history prior to this commit.

## Security Metrics Snapshot

- API Key Strength Enforcement: ✅ (`server/middleware/validation.js`, `shared/apiKey.js`)
- Rate Limiting Controls: ✅ (`server/middleware/bruteForce.js`, `server/metrics/rateLimitMetrics.js`)
- Input Validation Coverage: ✅ (Zod schemas + server/__tests__/api_validation.test.js)
- Audit Logging Coverage: ✅ (`server/middleware/auditLog.js`, `server/__tests__/audit_log.test.js`)
- HTTPS Enforcement: ⚠️ (Documented in README/SECURITY for production infrastructure)
- Observability Coverage: ✅ (`/api/monitoring`, admin dashboard (OBS-2), and request-id middleware operational)

### Coverage Counters

- Security Controls Implemented: 12/12 (100%) — admin dashboard UX/ops tooling now live.
- Critical Issues Resolved: 3/3 (100%) — API key policy, audit logging, and .env template delivered.
- High Priority Issues Resolved: 4/4 (100%) — Phase 1 backlog fully cleared.

<!-- markdownlint-disable -->

# Security Hardening Scoreboard

Last Updated: 2025-10-07 (revalidated for AI_IMPLEMENTATION_PROMPT.md)

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
| P2-DOC-1  | README deep-dive sections              | DONE                                   | main   | —  | README.md (Usage Examples, Monitoring, CI, Known Limitations) | Adds usage walkthroughs, troubleshooting, and operational guidance. |
| P2-DOC-2  | HARDENING_SCOREBOARD sync process      | DONE                                   | main   | —  | docs/HARDENING_SCOREBOARD.md (this file) | Status verified against AI_IMPLEMENTATION_PROMPT.md. |
| P2-DOC-3  | OpenAPI error codes (WEAK_KEY, etc.)   | DONE                                   | main   | —  | docs/openapi.yaml (WEAK_KEY examples, ErrorResponse schema) | 400/401/403/429 now document error payloads and security requirements. |
| P2-DOC-4  | AGENTS.md roadmap refresh              | TODO                                   | —      | —  | —                           | Review required to incorporate latest timelines once OpenAPI docs are updated. |

## Phase 3 — Observability & Future Work

| ID        | Title                         | Status (TODO/IN PROGRESS/DONE/BLOCKED) | Branch | PR | Evidence (CI/logs/coverage) | Notes |
|-----------|-------------------------------|----------------------------------------|--------|----|-----------------------------|-------|
| OBS-2     | Admin dashboard               | TODO                                   | —      | —  | —                           | No admin UI/route implemented; remains follow-up item. |
| OBS-3     | Request ID tracking middleware | TODO                                   | —      | —  | —                           | req.id currently depends on Express defaults; needs explicit middleware for tracing. |
| CODE-1    | Complex function refactoring   | TODO                                   | —      | —  | —                           | Large handlers (e.g., server/app.js) still exceed preferred complexity; refactor pending. |
| CODE-2    | Magic numbers extraction       | TODO                                   | —      | —  | —                           | Audit flagged configuration constants that still live inline. |

> Historical scoreboard snapshots remain available in git history prior to this commit.

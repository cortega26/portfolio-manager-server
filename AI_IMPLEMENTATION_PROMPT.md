<!-- markdownlint-disable -->
# Task: Kick Off Phase 5 Testing & CI Hardening for Portfolio Manager

## Context Snapshot (October 2025)
- **Project**: Node.js/React portfolio manager with Express backend (`server/`) and Vite frontend (`src/`).
- **Baseline**: Phases 1–4 from `comprehensive_audit_v3.md` are merged on `main` (security hardening, documentation refresh, observability, virtualization, API versioning, dashboard benchmark toggles, KPI refresh, frontend operations playbook).
- **Current Focus**: Phase 5 initiatives tracked in `docs/HARDENING_SCOREBOARD.md` under "Testing & CI Hardening" — frontend coverage expansion (P5-TEST-1), load/performance regression harness (P5-TEST-2), and end-to-end/CI reliability automation (P5-CI-1).
- **Primary Sources**: `comprehensive_audit_v3.md` (§1 Test Coverage & Quality, minor gaps), `docs/HARDENING_SCOREBOARD.md`, Vitest suites in `src/__tests__/` and `server/__tests__/`, and CI workflow expectations in `AGENTS.md`/`README.md`.

## Active Objectives (Phase 5)

### 1. P5-TEST-1 — Frontend Component Coverage Expansion (Priority: 🔴 High, Effort: 4h)
**Goal**: Close the audit gap on limited React component coverage by exercising dashboard navigation, transaction form validation, and holdings rendering flows.【F:comprehensive_audit_v3.md†L66-L101】

**Scope**:
- `src/components/` dashboard, transactions, and holdings UI.
- Existing Vitest suites under `src/__tests__/` and any new test helpers.

**Requirements**:
1. Add Vitest + React Testing Library cases for tab navigation, transaction form validation errors, and holdings table rendering (per audit recommendations).
2. Ensure tests fail on missing accessibility labels or console warnings (reuse existing `setupTests` guardrails).
3. Achieve ≥90% statement/branch coverage for updated components and document coverage deltas in PR body.
4. Update `README.md` testing section and scoreboard row P5-TEST-1 with status, coverage numbers, and command outputs.

**Acceptance Criteria**:
- Tests cover the three highlighted UI areas with deterministic fixtures.
- Coverage reports confirm ≥90% on touched files and no regression in global thresholds.
- Documentation reflects new coverage expectations and references supporting commands/logs.

### 2. P5-TEST-2 — Performance & Load Regression Harness (Priority: 🟡 Medium, Effort: 5h)
**Goal**: Introduce automated load/performance checks to address the audit's call for stress and performance testing.【F:comprehensive_audit_v3.md†L88-L105】

**Scope**:
- Utility scripts under `tools/` or `server/perf/` for synthetic transaction generation.
- Vitest or Node-based performance tests executed under `npm run test:perf` (new script if required).
- Metrics documentation (`docs/testing-strategy.md`, `README.md`).

**Requirements**:
1. Implement repeatable performance test(s) that process ≥10,000 transactions and assert completion under documented thresholds (e.g., <1s for holdings build) using generated fixtures from the audit example.
2. Capture runtime metrics (duration, memory) and emit structured logs suitable for CI consumption.
3. Wire the suite into npm scripts (e.g., `npm run test:perf`) and describe execution guidance in README/testing strategy.
4. Update scoreboard row P5-TEST-2 with evidence (command + output snippet) and note any environment caveats.

**Acceptance Criteria**:
- Performance harness runs locally with documented thresholds and structured output.
- CI integration plan documented (even if execution deferred due to runtime limits).
- Documentation highlights how to interpret results and respond to regressions.

### 3. P5-CI-1 — End-to-End & CI Reliability Automation (Priority: 🔴 High, Effort: 6h)
**Goal**: Add end-to-end coverage (Playwright/Cypress) and harden CI per audit guidance for UI regression detection.【F:comprehensive_audit_v3.md†L101-L105】

**Scope**:
- New E2E test directory (e.g., `e2e/`) with Playwright or Cypress configuration.
- GitHub Actions workflow updates or documentation for running the suite (follow AGENTS.md guardrails).
- README/scoreboard documentation of CI expectations.

**Requirements**:
1. Choose Playwright or Cypress (prefer Playwright) and scaffold smoke tests covering login/auth flows, dashboard benchmark toggles, and KPI presence.
2. Integrate the suite with npm scripts (`npm run test:e2e`) and document headless execution plus artifact capture (screenshots/video) expectations.
3. Propose CI pipeline updates (workflow YAML snippet or documented plan) ensuring sequencing with lint/unit/perf checks.
4. Update scoreboard row P5-CI-1 with status, linking to scripts, tests, and any follow-up tasks.

**Acceptance Criteria**:
- E2E tests run locally in headless mode with deterministic fixtures/mocks (no external API hits).
- Documentation clearly explains setup, execution, and CI integration steps.
- Scoreboard reflects progress with references to scripts/tests and CI considerations.

## Delivery Checklist (apply to every Phase 5 PR)
1. **Branch**: `feat/phase5-<slug>`.
2. **Code**: Limit scope to one Phase 5 objective per PR unless coupling is unavoidable.
3. **Tests**: Run `npm run lint`, `npm test -- --coverage`, relevant performance/E2E scripts, and `npm run build`. Capture logs/metrics for PR evidence.
4. **Docs**: Update `README.md`, `docs/HARDENING_SCOREBOARD.md`, and related guides (`docs/testing-strategy.md`, etc.) in the same PR.
5. **Evidence**: Attach CI links, coverage/performance stats, and (for UI/E2E) screenshots or trace artifacts in PR description.
6. **Compliance**: Uphold security guardrails (no `shell=true`, structured logging, validated inputs) and maintain coverage thresholds.

## Kickoff Questions (confirm before coding)
- Which Phase 5 objective (P5-TEST-1, P5-TEST-2, or P5-CI-1) are you addressing first?
- How will you capture metrics/coverage evidence to close the audit gaps?
- What fallbacks/mocks are required to keep performance/E2E suites deterministic (no live API calls)?

Once confirmed, begin with P5-TEST-1 to shore up UI coverage before layering on performance and E2E automation.

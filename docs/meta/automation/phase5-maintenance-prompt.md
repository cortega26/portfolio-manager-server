<!-- markdownlint-disable -->
# Task: Sustain Phase 5 Testing & CI Hardening Baseline for Portfolio Manager

## Context Snapshot (October 2025)
- **Project**: Node.js/React portfolio manager with Express backend (`server/`) and Vite frontend (`src/`).
- **Baseline**: Phases 1–5 from `comprehensive_audit_v3.md` are merged on `main` — the codebase now ships with security hardening, documentation refresh, observability, virtualization, API versioning, benchmark toggles, KPI refresh, frontend operations playbook, and fully delivered testing/CI hardening objectives.
- **Scoreboard Status**: `docs/reference/HARDENING_SCOREBOARD.md` is locked for maintenance; every Phase 5 row lists the commands, evidence, and README references backing the completed work.
- **Primary References**: `comprehensive_audit_v3.md` (§1 Test Coverage & Quality), README.md (§§Testing & quality gates, Continuous Integration), Vitest suites in `src/__tests__/` and `server/__tests__/`, performance harness utilities in `tools/`, and Playwright automation in `e2e/`.

## Maintenance Objectives (Phase 5)

### 1. P5-TEST-1 — Frontend Component Coverage (Regression Guardrails)
**Status**: Completed — holdings, navigation, and validation flows already exercise the dashboard via Vitest + React Testing Library.

**Guardrails**:
- Keep component-level coverage at or above the documented benchmarks (HoldingsTab: 166/168 lines, 28/33 branches per latest run) by extending specs whenever UI logic changes.
- Preserve `setupTests` console warning/error guards and accessibility assertions to prevent silent regressions.
- Reflect any new commands or coverage expectations in README.md (§Testing & quality gates) before updating the scoreboard.

**When modifying**:
1. Audit the impacted components/tests, ensuring new states are deterministic and offline-friendly.
2. Capture `npm run test:coverage` output for PR evidence and confirm no threshold regressions.
3. Update documentation only if procedures or expectations shift; otherwise record validation in the PR body.

### 2. P5-TEST-2 — Performance & Load Regression Harness (Regression Guardrails)
**Status**: Completed — `npm run test:perf` drives ≥12k synthetic transactions under the <1s threshold with structured JSON metrics.

**Guardrails**:
- Maintain the <1 000 ms SLA for holdings builder throughput and ensure metrics include duration, heap delta, NAV sample, and thresholds.
- Keep synthetic fixture generation deterministic (no external price API calls) for CI stability.
- Document any threshold adjustments, new metrics, or script changes in README/testing-strategy and mirror updates in the scoreboard.

**When modifying**:
1. Run `npm run test:perf` locally (or mark Deferred to CI with justification) after code or fixture changes.
2. Compare outputs against previous baselines; investigate regressions before merging.
3. Provide structured log snippets or metrics in the PR evidence section.

### 3. P5-CI-1 — End-to-End & CI Reliability Automation (Regression Guardrails)
**Status**: Completed — Playwright smoke suite authenticates, toggles benchmarks, and asserts KPI visibility with mocked API responses.

**Guardrails**:
- Keep Playwright tests headless, deterministic, and offline; ensure fixtures intercept all network calls.
- Retain artefact capture (screenshots, traces, JUnit XML) and update CI snippets if script names or paths change.
- Surface any CI pipeline updates or prerequisites (e.g., browser installs) in README.md (§Continuous Integration) and synchronize with the scoreboard.

**When modifying**:
1. Execute `npm run test:e2e` locally (or mark Deferred to CI) alongside lint, coverage, and build commands.
2. Update workflow YAML snippets or documentation when CI orchestration changes.
3. Attach relevant artefacts or log summaries in the PR body to demonstrate stability.

## Delivery Checklist (apply to every Phase 5-touching PR)
1. **Branch**: `feat/phase5-<slug>` or equivalent conventional branch naming.
2. **Scope**: Limit changes to one regression area unless a cross-cutting fix is unavoidable; note any coupling in the PR description.
3. **Tests**: Run `npm run lint`, `npm test -- --coverage`, `npm run test:perf`, `npm run test:e2e` (or justify deferral), and `npm run build`. Capture command outputs for evidence.
4. **Docs**: Update README.md, `docs/reference/HARDENING_SCOREBOARD.md`, and related guides (`docs/playbooks/testing-strategy.md`, etc.) whenever expectations change; otherwise confirm existing documentation remains accurate.
5. **Evidence**: Provide logs for coverage, performance metrics, and E2E runs (including artefact paths or uploaded reports) in the PR body.
6. **Compliance**: Uphold security guardrails (no `shell=true`, structured logging, validated inputs) and maintain coverage/performance thresholds noted above.

## Kickoff Questions (confirm before coding)
- Which Phase 5 deliverable does your change touch (coverage, performance harness, or E2E/CI)?
- How will you prove that existing thresholds (coverage ≥90%, perf <1 000 ms, deterministic E2E) remain satisfied?
- What mocks or fixtures are needed to keep the suite offline and deterministic after your modifications?

Once aligned, verify current baselines (coverage/performance/E2E) before iterating on enhancements or fixes.

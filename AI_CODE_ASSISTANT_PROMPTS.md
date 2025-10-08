<!-- markdownlint-disable -->
# AI Code Assistant Prompt Pack

Use these prompts to align any AI helper with the current repository state, audit findings, and guardrails. Each block can be pasted directly into an AI session before sharing follow-up instructions or diffs.

## 1. Phase 5 Context Sync
```
You are contributing to cortega26/portfolio-manager-server (React + Vite frontend, Express backend).
Baseline: Phases 1–4 from comprehensive_audit_v3.md are complete (security hardening, documentation refresh, observability, virtualization, API versioning, dashboard benchmark toggles, KPI refresh, frontend operations playbook).
Outstanding focus: Phase 5 deliverables from AI_IMPLEMENTATION_PROMPT.md (P5-TEST-1 frontend coverage, P5-TEST-2 load/perf harness, P5-CI-1 end-to-end & CI reliability) mapped in docs/HARDENING_SCOREBOARD.md.
Before coding, review AI_IMPLEMENTATION_PROMPT.md, docs/HARDENING_SCOREBOARD.md (Phase 5 table), and current Vitest/E2E setup in src/__tests__/, server/__tests__/, and tools/.
Follow repository guardrails: keep coverage ≥90% on touched files, avoid shell=true, emit structured logs, and update docs/HARDENING_SCOREBOARD.md + README with any testing/CI changes.
```

## 2. P5-TEST-1 Frontend Coverage Prompt
```
Task: Deliver P5-TEST-1 from AI_IMPLEMENTATION_PROMPT.md.
Close the audit gap on limited frontend tests by exercising dashboard navigation, transaction form validation, and holdings rendering flows.
Files: src/components/*.jsx (dashboard/tabs/forms), src/__tests__/, shared test utilities.
Steps:
1. Add Vitest + React Testing Library specs covering tab switching, validation errors, and holdings table rendering; ensure console.warn/error triggers fail the suite per setupTests.
2. Reach ≥90% coverage for updated components and capture coverage summary for PR evidence.
3. Document new tests in README.md (Testing section) and update docs/HARDENING_SCOREBOARD.md row P5-TEST-1 with command outputs.
Run npm run lint, npm test -- --coverage, npm run build before finalizing.
```

## 3. P5-TEST-2 Load & Performance Harness Prompt
```
Task: Deliver P5-TEST-2 (performance/load regression harness).
Focus files: tools/ or server/perf/ for generators, server/finance/ modules exercised by performance tests, npm scripts.
Requirements: generate ≥10k synthetic transactions, assert processing within documented thresholds (<1s for holdings builder per audit example), emit structured metrics, and wire into npm run test:perf with README/testing-strategy guidance. Update docs/HARDENING_SCOREBOARD.md row P5-TEST-2 with evidence and notes on runtime constraints.
Run npm run lint, npm test -- --coverage, npm run test:perf, npm run build before finalizing (mark heavy commands Deferred to CI if unavailable).
```

## 4. P5-CI-1 End-to-End & CI Reliability Prompt
```
Task: Deliver P5-CI-1 (end-to-end automation + CI plan).
Touch points: new e2e/ directory with Playwright (preferred) or Cypress, npm scripts (npm run test:e2e), potential GitHub Actions workflow updates, docs/README scoreboard notes.
Steps:
1. Scaffold headless E2E smoke tests covering login/auth, dashboard benchmark toggles, and KPI presence with deterministic fixtures/mocks.
2. Document how to run the suite locally/CI, capture artifacts (screenshots/traces), and propose workflow integration (include YAML snippet or explicit plan).
3. Update README.md (Testing/CI sections) and docs/HARDENING_SCOREBOARD.md row P5-CI-1 with status, scripts, and evidence.
Execute npm run lint, npm test -- --coverage, npm run test:e2e (or document Deferred to CI), npm run build before final response.
```

## 5. PR Completion Checklist Prompt
```
Before final response:
- Provide diffs with citations.
- Summarize coverage/performance metrics gathered for Phase 5 work.
- List commands executed (lint, tests, build, perf/E2E scripts) with results; mark “Deferred to CI” if tooling unavailable.
- Confirm docs/HARDENING_SCOREBOARD.md updated for relevant Phase 5 rows (P5-TEST-1, P5-TEST-2, P5-CI-1).
- Prepare PR body using make_pr with compliance summary: 📊 COMPLIANCE line, model used, tests, security scans, failures if any.
```

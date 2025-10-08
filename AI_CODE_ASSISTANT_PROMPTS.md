<!-- markdownlint-disable -->
# AI Code Assistant Prompt Pack

Use these prompts to align any AI helper with the current repository state, audit findings, and guardrails. Each block can be pasted directly into an AI session before sharing follow-up instructions or diffs.

## 1. Phase 5 Completion Context Sync
```
You are contributing to cortega26/portfolio-manager-server (React + Vite frontend, Express backend).
Baseline: Phases 1–5 from comprehensive_audit_v3.md are merged on main (security hardening, documentation refresh, observability, virtualization, API versioning, dashboard benchmark toggles, KPI refresh, frontend operations playbook, testing/CI hardening).
No audit action items remain open; docs/HARDENING_SCOREBOARD.md captures evidence for each phase and is now locked for maintenance.
Before coding, review AI_IMPLEMENTATION_PROMPT.md for guardrails, docs/HARDENING_SCOREBOARD.md for historical context, and the existing Vitest/Playwright/performance harnesses in src/__tests__/, server/__tests__/, tools/, and e2e/ to ensure your changes preserve their guarantees.
Follow repository guardrails: keep coverage ≥90% on touched files, avoid shell=true, emit structured logs, and update docs/HARDENING_SCOREBOARD.md + README if you adjust testing/CI expectations.
```

## 2. P5-TEST-1 Frontend Coverage Regression Prompt
```
Use when modifying dashboard React components or their tests.
Files: src/components/*.jsx (dashboard/tabs/forms), src/__tests__/, shared test utilities.
Steps:
1. Re-run existing Vitest + React Testing Library suites to ensure tab navigation, validation errors, and holdings rendering flows remain covered; extend tests for any new UI paths while keeping console.warn/error hooks active.
2. Maintain ≥90% coverage on touched components and capture summaries (README’s Testing & quality gates section lists current benchmarks).
3. Update README.md and docs/HARDENING_SCOREBOARD.md only if coverage expectations or commands change; otherwise note validation in your PR evidence.
Always run npm run lint, npm test -- --coverage, and npm run build before finalizing.
```

## 3. P5-TEST-2 Performance Harness Maintenance Prompt
```
Use when adjusting ledger/holdings performance code or synthetic load tooling.
Focus files: tools/perf harness scripts, server/finance modules exercised by the harness, npm scripts.
Requirements: keep the ≥10k synthetic transaction benchmark under the documented <1s threshold, ensure structured metrics (duration, heap, NAV samples) still emit, and update npm run test:perf if command names or parameters shift.
Document any threshold or metric changes in README/testing-strategy guidance and refresh docs/HARDENING_SCOREBOARD.md notes if expectations move.
Run npm run lint, npm test -- --coverage, npm run test:perf, and npm run build (mark heavy commands Deferred to CI if unavailable) before finalizing.
```

## 4. P5-CI-1 End-to-End & CI Reliability Prompt
```
Use when modifying Playwright smoke tests, CI orchestration, or related fixtures.
Touch points: e2e/ directory, Playwright configuration, npm run test:e2e script, GitHub Actions workflow definitions, README/scoreboard documentation.
Steps:
1. Keep headless smoke tests covering auth, benchmark toggles, and KPI visibility deterministic by stubbing network calls and maintaining artefact capture (screenshots, traces, JUnit output).
2. Update README.md (Testing/CI sections) and docs/HARDENING_SCOREBOARD.md if execution steps, prerequisites, or workflow snippets change.
3. Confirm npm run test:e2e succeeds locally (or document Deferred to CI with rationale) alongside lint, coverage, and build commands before final response.
```

## 5. PR Completion Checklist Prompt
```
Before final response:
- Provide diffs with citations.
- Summarize coverage/performance/E2E metrics validated for the touched Phase 5 deliverables.
- List commands executed (lint, tests, build, perf/E2E scripts) with results; mark “Deferred to CI” if tooling unavailable.
- Confirm docs/HARDENING_SCOREBOARD.md remains accurate (update only if expectations changed).
- Prepare PR body using make_pr with compliance summary: 📊 COMPLIANCE line, model used, tests, security scans, failures if any.
```

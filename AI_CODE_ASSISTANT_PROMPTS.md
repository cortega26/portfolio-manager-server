<!-- markdownlint-disable -->
# AI Code Assistant Prompt Pack

Use these prompts to align any AI helper with the current repository state, audit findings, and guardrails. Each block can be pasted directly into an AI session before sharing follow-up instructions or diffs.

## 1. Phase 4 Context Sync
```
You are contributing to cortega26/portfolio-manager-server (React + Vite frontend, Express backend).
Baseline: Phases 1–3 from comprehensive_audit_v3.md are complete (security hardening, documentation refresh, observability, virtualized tables, API versioning, testing strategy guide).
Outstanding focus: Phase 4 deliverables from AI_IMPLEMENTATION_PROMPT.md (P4-UI-1 benchmark toggles, P4-UI-2 KPI refresh, P4-DOC-1 frontend ops playbook).
Before coding, review AI_IMPLEMENTATION_PROMPT.md, docs/HARDENING_SCOREBOARD.md (Phase 4 table), and the current Dashboard/Portfolio UI implementation under src/components/.
Follow repository guardrails: no shell=true, maintain structured logging, keep coverage ≥90% for touched files, and update docs/HARDENING_SCOREBOARD.md + README together with UI changes.
```

## 2. P4-UI-1 Benchmark Toggle Helper
```
Task: Deliver P4-UI-1 from AI_IMPLEMENTATION_PROMPT.md.
Add benchmark view toggles and blended charting controls to the dashboard ROI visualizations.
Files: src/components/DashboardTab.jsx, src/components/PortfolioControls.jsx (if shared controls needed), src/hooks (create or update), src/__tests__/DashboardTab.test.jsx (or add new test files), shared formatting utilities.
Steps:
1. Introduce UI controls to switch between 100% SPY, blended benchmark, and other benchmark series exposed by the backend.
2. Extend ROI chart data handling to plot the selected blend while preserving accessibility (legends, aria attributes) and responsive layout.
3. Add state synchronization with persisted preferences if available (localStorage hook already exists? confirm; otherwise document TODO) and update tests to cover toggle interactions and chart data mapping.
4. Update README (dashboard section) to describe the new benchmark toggle and cite relevant API endpoints; mark docs/HARDENING_SCOREBOARD.md row P4-UI-1 as DONE with evidence links.
Run npm run lint, npm test -- --coverage, npm run build before finalizing.
```

## 3. P4-UI-2 KPI Panel Refresh Prompt
```
Task: Deliver P4-UI-2 (dashboard KPI refresh for cash & benchmarks).
Focus files: src/components/DashboardTab.jsx, src/utils/format.js, src/hooks/usePortfolioMetrics.js (or equivalent), src/__tests__/DashboardTab.metrics.test.jsx.
Requirements: surface cash drag metrics, benchmark comparisons, and ensure cards remain responsive (sm/ lg breakpoints). Computations must align with shared helpers and include tests verifying numeric accuracy and formatting. Document any new derived metrics in README.
```

## 4. P4-DOC-1 Frontend Operations Playbook Prompt
```
Task: Deliver P4-DOC-1 (frontend operations playbook).
Touch points: docs/frontend-operations.md (new), README.md (link updates), docs/HARDENING_SCOREBOARD.md (Phase 4 notes), AGENTS.md references if workflows change.
Document Admin tab workflows, benchmark toggles, KPI refresh behaviors, and incident response for UI regressions. Include deployment verification steps (smoke tests, accessibility checks) and tie them back to scoreboard evidence.
```

## 5. PR Completion Checklist Prompt
```
Before final response:
- Provide diffs and cite files.
- Summarize performance or UX metrics captured (e.g., render timings, Lighthouse, accessibility notes).
- List commands executed (lint, tests, build) with results; mark "Deferred to CI" if tooling unavailable.
- Confirm docs/HARDENING_SCOREBOARD.md updated for completed objectives (P4-UI-1, P4-UI-2, P4-DOC-1 as applicable).
- Prepare PR body using make_pr tool with compliance summary: 📊 COMPLIANCE line, model used, tests, security scans, failures.
```

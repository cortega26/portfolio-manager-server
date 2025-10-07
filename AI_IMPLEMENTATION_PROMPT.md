<!-- markdownlint-disable -->
# Task: Kick Off Phase 4 Frontend Experience for Portfolio Manager

## Context Snapshot (October 2025)
- **Project**: Node.js/React portfolio manager with Express backend (`server/`) and Vite frontend (`src/`).
- **Baseline**: Phases 1–3 from `comprehensive_audit_v3.md` are merged on `main` (security hardening, documentation refresh, observability dashboards, virtualization, API versioning, testing strategy).
- **Current Focus**: Phase 4 items highlighted in `docs/HARDENING_SCOREBOARD.md` under "Frontend Experience" — benchmark view toggles (P4-UI-1), KPI panel refresh (P4-UI-2), and frontend operations playbook (P4-DOC-1).
- **Primary Sources**: `comprehensive_audit_v3.md` (UX + benchmark findings), `docs/HARDENING_SCOREBOARD.md`, `docs/cash-benchmarks.md`, existing dashboard implementation in `src/components/` and shared utilities in `shared/`.

## Active Objectives (Phase 4)

### 1. P4-UI-1 — Benchmark Toggle & Blended Charting (Priority: 🟡 Medium, Effort: 4h)
**Goal**: Give users control over ROI comparisons between the default 100% SPY benchmark and blended benchmark views derived from actual cash vs equity weights (audit §4 UX notes, scoreboard P4-UI-1).

**Scope**:
- `src/components/DashboardTab.jsx` (chart + controls) and any shared control surfaces such as `src/components/PortfolioControls.jsx`.
- Supporting hooks/utilities (`src/hooks/` directory) for persisted UI preferences or data shaping.
- Related tests (`src/__tests__/DashboardTab.test.jsx`, property-based ROI checks if applicable).

**Requirements**:
1. Introduce accessible toggle controls (buttons, segmented control, or dropdown) that switch ROI chart lines between at least two benchmark modes: 100% SPY and blended benchmark from backend data. Include ability to compare multiple series concurrently when feasible.
2. Adjust chart data preparation to consume benchmark series already exposed by backend endpoints (`/api/returns/daily`, `/api/benchmarks/summary`). Ensure legend labels, colors, and aria attributes remain descriptive.
3. Persist user selection across sessions (use existing localStorage helpers if present; otherwise add a hook with tests) with sane defaults when data missing.
4. Validate behavior with unit/integration tests that simulate toggle interaction, assert correct series visibility, and guard against regressions (e.g., fallback when benchmark data absent).
5. Update README dashboard section and `docs/HARDENING_SCOREBOARD.md` row P4-UI-1 with implementation details, evidence (test command, screenshots/metrics), and any limitations.

**Acceptance Criteria**:
- ROI chart renders the selected benchmark mode without layout regressions (verified in Vitest DOM tests or Storybook snapshot if available).
- Toggled state persists after reload (tested via jsdom localStorage mock).
- Accessibility audit (axe or manual) shows controls are keyboard operable and labelled.
- Scoreboard marks P4-UI-1 as DONE referencing commit/PR.

### 2. P4-UI-2 — KPI Panel Refresh for Cash & Benchmarks (Priority: 🟡 Medium, Effort: 3h)
**Goal**: Surface cash drag and benchmark-relative metrics inline with audit recommendations so users can quickly evaluate performance drivers.

**Scope**:
- `src/components/DashboardTab.jsx` KPI cards and any helper components.
- Metrics computation layers (`src/hooks/usePortfolioMetrics.js`, `shared/metrics/` if present) to expose cash drag %, blended benchmark delta, SPY delta, etc.
- Tests covering new metrics (`src/__tests__/DashboardTab.metrics.test.jsx`, `src/__tests__/metrics/`).

**Requirements**:
1. Extend metrics hook/utilities to compute: cash allocation %, cash drag impact (difference between blended benchmark and 100% SPY), and benchmark-relative ROI deltas.
2. Refresh KPI card layout to display the new metrics without sacrificing responsiveness (sm, md, lg breakpoints) and ensure dark mode compatibility.
3. Provide contextual descriptions/tooltips referencing `docs/cash-benchmarks.md` definitions so users understand calculations.
4. Add tests verifying metric math and formatting (use deterministic fixtures). Ensure coverage ≥90% for changed modules.
5. Update README (dashboard metrics subsection) and scoreboard row P4-UI-2 with evidence and coverage stats.

**Acceptance Criteria**:
- KPI section renders new metrics alongside existing totals with no overflow on mobile widths.
- Tests validate numerical accuracy for sample portfolios (cash-heavy vs equity-heavy) and guard against regressions.
- Documentation explains each KPI and links to deeper references.
- Scoreboard shows P4-UI-2 as DONE with proof.

### 3. P4-DOC-1 — Frontend Operations Playbook (Priority: 🟡 Medium, Effort: 2h)
**Goal**: Document how to operate, verify, and troubleshoot the refreshed frontend experience per scoreboard guidance.

**Scope**:
- New doc `docs/frontend-operations.md` (or update existing if specified).
- README cross-links (navigation + operations sections).
- Any references in `AGENTS.md`, `AI_CODE_ASSISTANT_PROMPTS.md`, or onboarding docs that need alignment.

**Requirements**:
1. Produce an actionable playbook covering: dashboard smoke test checklist, benchmark toggle verification, KPI validation steps, accessibility spot checks, and deployment roll-back plan.
2. Include table of key configuration flags (`VITE_API_BASE`, feature toggles) with type/default/description per R4 docs policy.
3. Reference monitoring hooks (Admin tab, `/api/monitoring`) and describe how frontend changes integrate with observability (tie back to Phase 3 work).
4. Sync README (link to the new playbook + summary of operations workflow) and update scoreboard row P4-DOC-1 with status + evidence.
5. Ensure no instructions contradict existing security guardrails (structured logging, API key policies).

**Acceptance Criteria**:
- New documentation passes markdown lint (if configured) and contains no placeholders.
- README + AGENTS (if touched) link to the playbook and summarize updates.
- Scoreboard row P4-DOC-1 updated to DONE with references to tests/docs.

## Delivery Checklist (apply to every Phase 4 PR)
1. **Branch**: `feat/phase4-<slug>`.
2. **Code**: Implement only the scoped objective (P4-UI-1, P4-UI-2, or P4-DOC-1) unless pairing tasks in same PR is explicitly justified.
3. **Tests**: Run `npm run lint`, `npm test -- --coverage`, `npm run build`. Capture performance or accessibility metrics if UI renders change.
4. **Docs**: Update README, `docs/HARDENING_SCOREBOARD.md`, and any affected guides simultaneously.
5. **Evidence**: Attach CI links, coverage deltas, UX/performance metrics, and screenshots (desktop + mobile) in PR description when UI changes occur.
6. **Compliance**: Follow security guardrails (no `shell=true`, maintain structured logging, respect rate limiting and feature toggles).

## Kickoff Questions (confirm before coding)
- Which Phase 4 objective (P4-UI-1, P4-UI-2, or P4-DOC-1) are you addressing first?
- Have you reviewed current dashboard components, hooks, and docs to avoid regressions?
- What metrics or screenshots will you produce to demonstrate improved UX/performance?

Once confirmed, begin with P4-UI-1 unless an incident demands a different priority.

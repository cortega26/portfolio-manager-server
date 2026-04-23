# Todo — Strategic Redesign

> Spec: `spec.md` | Plan: `docs/implementation/portfolio-manager-strategic-redesign-plan.md`
> Updated as work progresses. Check off items immediately when done.

---

## Phase 0 — Scaffold (M1 Foundation)

- [x] Write `spec.md` with goals, implementation details, verification criteria
- [x] Overwrite `todo.md` with this checklist
- [ ] Create `tests/redesign/` test files (SR-100, SR-001, SR-007, SR-002, SR-004, SR-021)
  - [x] Present: SR-100, SR-001, SR-007, SR-002, SR-004
  - [ ] SR-021 currently lives in `tests/e2e/today-shell.spec.ts`, not `tests/redesign/`
- [x] Register `tests/redesign` in `tools/run-tests.mjs`

---

## Phase 1 — M1: Foundation

### SR-007 — Fix i18n defaultValue (P0, S)

- [x] `src/i18n/I18nProvider.jsx`: destructure `defaultValue` from vars before interpolation
- [x] `src/i18n/translations.js`: add `dashboard.zone2.empty`, `dashboard.zone2.emptyAria`, `dashboard.charts.title`
- [x] Verify: unit test in `tests/redesign/i18n.test.js` passes

### SR-100 — Feature flag system (P0, S)

- [x] Create `src/lib/featureFlags.js` with flag registry and localStorage reader
- [x] Create `src/hooks/useFeatureFlag.js` hook
- [x] Verify: unit test in `tests/redesign/featureFlags.test.js` passes

### SR-001 — Trust metadata schema (P0, M)

- [x] Create `shared/trust.ts` with SourceType, FreshnessState, ConfidenceState, DegradedReason, TrustMetadata
  - [x] `shared/trust.ts` exists
  - [x] Spec enum surface now includes `eod_estimated`, `manual`, `expired`, and explicit `DegradedReason`
- [x] Keep runtime helper `shared/trustUtils.js` with `buildTrustFromPriceStatus(status, asOf)`
  - [x] Helper exists as `shared/trustUtils.js`
  - [x] Decision: keep helper in JS for current Node/Vite runtime imports; keep canonical schema in `shared/trust.ts`
- [x] Verify: TypeScript compiles; unit test in `tests/redesign/trust.test.js` passes

---

## Phase 2 — M1/M2: Trust Layer

### SR-002 — Portfolio health summary endpoint (P0, M)

- [x] Create `server/routes/portfolioHealth.ts` with `GET /api/portfolio/:id/health`
- [x] Register route in Fastify app
- [x] Implement freshness logic from holdings + prices
  - [x] Basic snapshot-based trust exists
  - [x] Spec logic now uses exact fresh/stale/expired trading-day behavior
- [x] Implement action_count from inbox compute
- [x] Verify: API integration test in `tests/redesign/portfolioHealth.test.js` passes

### SR-003 — Trust metadata in price/analytics responses (P0, L)

- [x] `server/routes/prices.ts`: add `trust` field to each symbol in `symbolMeta`
- [x] `server/routes/analytics.ts` (or ROI endpoint): add top-level `trust` field
- [x] Verify: response assertions in tests pass

### SR-004 — Trust badge UI components (P0, M)

- [x] Create `src/components/shared/TrustBadge.jsx`
- [x] Create `src/components/shared/TrustTooltip.jsx`
- [x] Verify: component tests in `tests/redesign/TrustBadge.test.tsx` pass

### SR-005 — Trust badges on dashboard (P0, M)

- [x] `src/components/DashboardTab.jsx` or `DashboardZone1.jsx`: add TrustBadge behind `redesign.trustBadges` flag
- [x] Verify: existing dashboard tests still pass; flag-gated behavior tested

### SR-006 — Inbox rationale cards (P0, M)

- [x] `server/finance/inboxComputer.ts`: add `rationale` field to each InboxItem
- [x] `src/components/InboxTab.jsx`: render rationale text when present
- [x] Verify: API test confirms rationale exists; component test confirms render

---

## Phase 3 — M2: Review Workflow

### SR-020 — Review-first navigation model (P0, M)

- [x] Update `src/components/TabBar.jsx` to conditionally include `Today` tab
- [x] Update `src/PortfolioManagerApp.jsx` to render `TodayTab` when `redesign.todayShell` is on
- [x] Verify: flag-off renders unchanged; flag-on adds Today tab

### SR-021 — Today shell (P0, XL)

- [x] Create `src/components/review/TodayTab.jsx`
- [x] Create `src/components/review/PortfolioHealthBar.jsx` (uses health endpoint)
- [x] Wire all four sections into TodayTab
- [x] Handle loading/healthy/needs_attention/blocked/error states
  - [x] Loading, empty and error states exist in `PortfolioHealthBar`
  - [x] Today-level healthy/needs_attention/blocked state model exists
- [x] Verify: Playwright e2e test in `tests/e2e/today-shell.spec.ts` passes

### SR-022 — NeedsAttentionSection (P0, M)

- [x] Create `src/components/review/NeedsAttentionSection.jsx`
- [x] Descriptive empty state: "No action needed — your portfolio is on track."
- [x] Show top 5 HIGH urgency items with rationale
- [x] Verify: component tests for empty + populated states

### SR-023 — RecentChangesSection (P1, M)

- [x] Create `src/components/review/RecentChangesSection.jsx`
- [x] Read/write NAV snapshot to localStorage on each load
- [x] Descriptive empty state: "No meaningful changes since your last review."
- [x] Verify: component tests with mock NAV data

### SR-024 — DataBlockersSection (P1, M)

- [x] Create `src/components/review/DataBlockersSection.jsx`
- [x] Populate from health endpoint `degraded_reasons`
- [x] Empty state: "All data is current."
- [x] Verify: component tests

---

## Phase 4 — M2/M3: Architecture

### SR-080 — Carve PortfolioManagerApp.jsx (P0, XL)

- [x] Create `src/hooks/usePortfolioData.js` — extract all data-fetching state + effects
- [x] Create `src/hooks/usePortfolioActions.js` — extract all mutation handlers
- [ ] Verify: `wc -l src/PortfolioManagerApp.jsx` < 800; all existing tests pass
  - [ ] Current line count: 1803, extraction not integrated enough to meet the goal

### SR-082 — Split portfolio.ts routes (P0, XL)

- [ ] Create `server/routes/portfolioCore.ts`
- [ ] Create `server/routes/portfolioInbox.ts`
- [x] `server/routes/portfolioHealth.ts` (already created in SR-002)
- [ ] Update `portfolio.ts` to become thin router
- [ ] Verify: all portfolio tests pass; each sub-module < 250 lines

---

## Phase 5 — M3: Ledger Operations

### SR-040/041 — Import session + exception types (P0, M)

- [ ] Create `server/types/import.ts` with ImportSession, LedgerException, status enums
- [ ] Verify: TypeScript compilation clean

### SR-042 — Import session API endpoints (P0, L)

- [ ] Create `server/routes/portfolioLedger.ts`
  - [ ] `GET /api/portfolio/:id/import-sessions`
  - [ ] `GET /api/portfolio/:id/import-sessions/:sessionId/exceptions`
  - [ ] `PATCH /api/portfolio/:id/import-sessions/:sessionId/exceptions/:exceptionId`
- [ ] Verify: API integration tests pass

### SR-043 — Import preview flow (P0, XL)

- [ ] `POST /api/portfolio/:id/import/preview` — non-mutating, returns delta
- [ ] `POST /api/portfolio/:id/import/apply` — idempotent apply
- [ ] Verify: preview test confirms no transactions added; apply tested once

### SR-044 — Ledger operations center UI (P0, XL)

- [ ] Create `src/components/ledger/LedgerOpsCenter.jsx`
- [ ] Create `src/components/ledger/ImportSessionList.jsx`
- [ ] Create `src/components/ledger/ExceptionQueue.jsx`
- [ ] Create `src/components/ledger/ImportPreviewModal.jsx`
- [ ] All behind `redesign.ledgerOpsCenter` flag
- [ ] Verify: component render tests; flag-gated behavior

---

## Phase 6 — M4: Policy Guidance

### SR-060 — Portfolio policy schema (P0, L)

- [ ] Create `shared/policy.ts` with PortfolioPolicy interface and DEFAULT_POLICY
  - [x] Initial policy model exists as `shared/policy.js`
  - [ ] Decide whether to keep JS or convert to TS per spec
- [x] Verify: TypeScript compiles; validator unit tests pass

### SR-061 — Policy evaluation service (P0, XL)

- [ ] Create `server/services/policyEvaluator.ts`
  - [x] Pure evaluator currently exists in `shared/policy.js`
  - [ ] Move/split to the specified backend service if this remains the chosen architecture
- [x] Implement concentration check
- [x] Implement allocation drift check
- [x] Implement cash range check
- [x] Implement review cadence check
- [x] Verify: pure function unit tests for each rule
  - [x] Tests exist for concentration, allocation drift and cash range
  - [x] Review cadence test exists

### SR-062 — Inbox as recommendation queue (P0, L)

- [ ] Extend `InboxItem` with `source: 'threshold' | 'policy'` field
- [ ] Add lifecycle states: acknowledged | snoozed | dismissed | resolved
- [ ] Merge policy items into inbox when `redesign.policyGuidance` is on
- [ ] Verify: integration test confirms threshold + policy items merged

### SR-063 — Policy setup UI (P1, L)

- [ ] Create policy configuration section in `src/components/SettingsTab.jsx`
- [ ] Default policy pre-populated (no manual config required)
- [ ] Verify: renders without error; saving policy persists to backend

---

## Phase 7 — M5: Consolidation & Verification

- [ ] Run `npm test` — fix any regressions
- [ ] Run `npm run lint` — fix any warnings
- [ ] Run TypeScript compilation — fix any type errors
- [ ] Playwright e2e: today-shell.spec.ts passes
- [ ] Verify no raw i18n keys appear in primary surfaces
- [ ] Check hot-spot line counts: PortfolioManagerApp.jsx < 800, portfolio.ts retired
- [ ] Sub-agent review: "review spec.md and the current implementation for gaps"

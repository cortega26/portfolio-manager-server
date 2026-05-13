# Todo — Technical Debt Resolution

> Spec: `spec.md`
> Updated as work progresses. Check off items immediately when done.

---

## Item 1: Rename `portfolioStore.js` (P3) ✅

- [x] Audit imports — find all files importing from `state/portfolioStore.js`
- [x] Move `src/state/portfolioStore.js` → `src/utils/activePortfolioStorage.js`
- [x] Remove empty `src/state/` directory
- [x] Update all imports to new path
- [x] **Verify:** `npx vitest run`, `npm run lint`, zero imports from `state/`

## Item 2: Error Handling Unification (P2) ✅

### Phase 2a — Audit inline error patterns

- [x] `server/routes/prices.ts` — enumerate all `reply.code().send({error:})` patterns
- [x] `server/routes/signals.ts` — same
- [x] `server/routes/portfolio.ts` — same
- [x] `server/routes/portfolioHealth.ts` — same
- [x] `server/routes/analytics.ts` — same
- [x] `server/routes/benchmarks.ts` — same
- [x] `server/routes/cache.ts` — same
- [x] `server/routes/import.ts` — same
- [x] `server/routes/monitoring.ts` — same

### Phase 2b — Migrate to AppError

- [x] `server/routes/prices.ts` — replace inline errors with AppError-based sends
- [x] `server/routes/signals.ts` — same (no inline errors found)
- [x] `server/routes/portfolio.ts` — same
- [x] `server/routes/portfolioHealth.ts` — same
- [x] `server/routes/analytics.ts` — same
- [x] `server/routes/benchmarks.ts` — same (no inline errors found)
- [x] `server/routes/cache.ts` — same (no inline errors found)
- [x] `server/routes/import.ts` — same (no inline errors found)
- [x] `server/routes/monitoring.ts` — same (no inline errors found)

### Phase 2c — Verify

- [x] `npm run test:node` — all backend tests pass
- [x] `grep -rn "reply\.code.*\.send.*error" server/routes/` — zero matches
- [x] `npm run verify:typecheck:server` — only pre-existing errors
- [x] `npm run lint` — clean
- [x] `npm run verify:build` — builds

## Item 3: PortfolioManagerApp.jsx Decomposition (P2)

### Phase 3a — Write integration tests first

- [x] Create `src/__tests__/PortfolioManagerApp.integration.test.tsx`
  - [x] Test: renders header with title and subtitle
  - [x] Test: renders language selector dropdown
  - [x] Test: renders PortfolioControls with portfolio ID input
  - [x] Test: renders TabBar with navigation tabs
  - [x] Test: Dashboard tab is default active panel
  - [x] Test: clicking tab switches active panel
  - [x] Test: renders system alerts (error and warning)
  - [x] Test: shows DesktopSessionGate when session is locked
  - [x] Test: renders LoadingFallback during Suspense
  - [x] Test: toast display and dismiss

### Phase 3b — Extract AppHeader ✅

- [x] Create `src/components/AppHeader.jsx`
- [x] Update `src/PortfolioManagerApp.jsx` — use AppHeader
- [x] **Verify:** all tests pass

### Phase 3c — Extract SystemAlerts ✅

- [x] Create `src/components/SystemAlerts.jsx`
- [x] Update `src/PortfolioManagerApp.jsx` — use SystemAlerts
- [x] **Verify:** all tests pass

### Phase 3d — Extract TabPanel ✅

- [x] Create `src/components/TabPanel.jsx`
- [x] Update `src/PortfolioManagerApp.jsx` — use TabPanel
- [x] **Verify:** all tests pass

### Phase 3e — Extract useSystemAlerts hook ✅

- [x] Create `src/hooks/useSystemAlerts.js`
- [x] Update `src/PortfolioManagerApp.jsx` — use hook
- [x] **Verify:** all tests pass

### Phase 3f — Verify final ✅

- [x] `wc -l src/PortfolioManagerApp.jsx` ≤ 800 lines (728)
- [x] `npx vitest run` — all tests pass (118)
- [x] `npm run lint` — clean
- [x] `npm run verify:build` — builds

## Item 4: Frontend strict mode (P3) ✅

- [x] Enable `noImplicitAny` — fix errors (0 typecheck errors)
- [x] `npm run verify:typecheck` clean
- [x] `npx vitest run` passes
- [x] Enable `noUnusedLocals` — fix errors (0 errors)
- [x] Enable `noUnusedParameters` — fix errors (0 errors)
- [x] Enable `strictNullChecks` — fix errors (0 errors)
- [x] Enable `strictFunctionTypes` — fix errors (0 errors)
- [x] Enable `strictBindCallApply` — fix errors (0 errors)
- [x] Enable `strictPropertyInitialization` — fix errors (0 errors)
- [x] Final check: `npm run verify:typecheck` clean

## Item 5: Coverage Consolidation (P4) ✅

- [x] Add `--experimental-test-coverage` to `test:node:coverage` script
- [x] Configure coverage output directory to `coverage/server/`
- [x] Create `scripts/merge-coverage.mjs`
- [x] Add `coverage` npm script
- [x] **Verify:** `npm run test:node:coverage` produces lcov output
- [x] **Verify:** `npm run coverage` runs both and merges (154 records merged)

## Review Gates

- [x] After ~20 iterations: spawn sub-agent to "review spec.md and current implementation for gaps"
- [x] Loop on sub-agent feedback until alignment — all gaps fixed (8 inline error patterns converted)

# Spec: Technical Debt Resolution

> Created: 2026-05-12
> Status: Active

## Overview

Resolve five deferred debt items from the modernization plan. Work is ordered by
risk: easy wins first, then mechanical changes, then cross-cutting, then
large-bang changes.

### Execution methodology

1. Write integration tests capturing current behavior **before** changing code
2. Implement changes incrementally with tests passing after each step
3. Run full test suite after every meaningful commit
4. Review sub-agent every ~20 iterations to check for gaps

---

## 1. Rename `portfolioStore.js` (P3)

**Problem:** `src/state/portfolioStore.js` is a plain localStorage utility, not a
Zustand store. The name and directory path mislead developers.

**Goal:** Rename to accurately describe what it does.

### Implementation

1. Move `src/state/portfolioStore.js` → `src/utils/activePortfolioStorage.js`
2. Remove the empty `src/state/` directory
3. Update all imports to point to `../../utils/activePortfolioStorage.js`
4. Verify all existing tests still pass

### Files affected

- `src/state/portfolioStore.js` → moved
- `src/PortfolioManagerApp.jsx` — update import path
- `src/__tests__/portfolioStore.test.js` — update import path (if exists)

### Verification

- `grep -r "state/portfolioStore" src/` returns zero matches
- `grep -r "from.*state/" src/` returns zero matches (no remaining imports from `state/` directory)
- `npx vitest run` — all tests pass
- `npm run lint` — clean
- `ls src/state/ 2>&1` reports "No such file or directory"

---

## 2. Error Handling Unification (P2)

**Problem:** Three error patterns coexist:

1. Custom `AppError` hierarchy (`server/types/errors.ts`) — defined, barely used
2. Inline `reply.code(N).send({ error, message })` — most common, duplicates envelope logic
3. Global Fastify error handler — catches unhandled errors, handles `AppError` correctly

The inline pattern means changing the error envelope requires touching every route.

**Goal:** Route handlers throw `AppError` (or subclasses). The global Fastify error
handler (which already handles `AppError`) produces the canonical envelope.

### Error envelope contract (must NOT change)

The global handler currently produces this shape — it must remain identical:

```typescript
// For all AppError subclasses:
{ error: AppError.code, message: AppError.message, ...details ? { details } : {} }

// For unhandled errors (status >= 500, no AppError):
{ error: 'INTERNAL_ERROR', message: 'Unexpected server error' }
```

### Subclass mapping

| HTTP | Current code pattern               | New throw                                                                      |
| ---- | ---------------------------------- | ------------------------------------------------------------------------------ |
| 400  | `INVALID_*`, `VALIDATION_*`        | `throw new ValidationError(message, details)`                                  |
| 401  | `NO_SESSION_TOKEN`, `INVALID_*`    | `throw new AuthError(message)`                                                 |
| 404  | `NOT_FOUND`, `PORTFOLIO_NOT_FOUND` | `throw new NotFoundError(message)`                                             |
| 502  | `PRICE_FETCH_FAILED`               | `throw new AppError(message, { statusCode: 502, code: 'PRICE_FETCH_FAILED' })` |
| 503  | `STALE_DATA`                       | `throw new AppError(message, { statusCode: 503, code: 'STALE_DATA' })`         |

### Audit checklist — inline patterns to migrate

Search for `reply.code(` + `send({ error:` in every route file:

- `server/routes/prices.ts`
- `server/routes/signals.ts`
- `server/routes/portfolio.ts`
- `server/routes/portfolioHealth.ts`
- `server/routes/analytics.ts`
- `server/routes/benchmarks.ts`
- `server/routes/cache.ts`
- `server/routes/import.ts`
- `server/routes/monitoring.ts`

### Verification

- `npm run test:node` — all backend tests pass
- `npm run verify:typecheck:server` — only pre-existing errors remain
- `grep -rn "reply\.code.*\.send.*error" server/routes/` — zero matches
- `npm run verify:build` — builds
- All API contract tests pass unchanged (envelope is identical)

---

## 3. PortfolioManagerApp.jsx Decomposition (P2)

**Problem:** `src/PortfolioManagerApp.jsx` is 1810 lines with 26 `useState` calls,
12 `useCallback` handlers, 9 `useEffect` blocks, 16 `useMemo` values. It renders
11 conditional tab panels inside a Suspense boundary. Cannot be tested or reasoned
about as a unit.

**Goal:** Extract cohesive sub-components. Final file under 800 lines. All
existing tests pass. No visual or behavioral changes.

### Phase 3a — Write integration tests (precondition)

Test file: `src/__tests__/PortfolioManagerApp.integration.test.tsx`

Tests that must pass before any decomposition:

1. **Renders header** — title, subtitle visible
2. **Renders language selector** — dropdown with en/es options
3. **Renders PortfolioControls** — portfolio ID input visible
4. **Renders TabBar** — navigation tabs visible
5. **Switches tabs** — clicking tab changes active panel
6. **Renders default tab** — Dashboard tab panel visible by default
7. **Renders system alerts** — error/warning alerts render when present
8. **Shows DesktopSessionGate when locked** — mocked session-locked state
9. **Renders LoadingFallback** — Suspense fallback renders during lazy load
10. **Toast display and dismiss** — pushToast shows toast, dismissToast hides it

### Phase 3b — Extract AppHeader component

Extract the header section (lines 1560-1580) to `src/components/AppHeader.jsx`.

**Interface:**

```tsx
interface AppHeaderProps {
  language: string;
  onLanguageChange: (lang: string) => void;
}
```

### Phase 3c — Extract SystemAlerts component

Extract the alerts region (lines 1597-1616) to `src/components/SystemAlerts.jsx`.

**Interface:**

```tsx
interface AlertEntry {
  id: string;
  type: 'error' | 'warning';
  message: string;
  detail?: string;
  requestDetails?: string;
}

interface SystemAlertsProps {
  alerts: AlertEntry[];
}
```

Must handle: empty (no alerts rendered), warning (amber), error (rose) states.

### Phase 3d — Extract TabPanel component

Extract the conditional tab rendering (lines 1618-1805) with the Suspense
boundary to `src/components/TabPanel.jsx`.

**Interface:** Pass through all props that individual tabs receive. No props API
changes for leaf components (DashboardTab, HoldingsTab, etc.).

### Phase 3e — Extract useSystemAlerts hook

Extract the `activeAlerts` useMemo derivation to `src/hooks/useSystemAlerts.js`.

**Interface:**

```tsx
function useSystemAlerts(config: {
  priceAlert: { type: string; message: string } | null;
  roiAlert: { type: string; message: string } | null;
  t: (key: string) => string;
}): AlertEntry[];
```

### Verification

- `npx vitest run` — all 100+ frontend tests pass
- `wc -l < src/PortfolioManagerApp.jsx` — ≤ 800 lines
- `npm run lint` — clean
- `npm run verify:build` — builds
- New component files exist with correct exports

---

## 4. Frontend `strict: true` in tsconfig (P3)

**Problem:** `tsconfig.json` has `strict: false`. With `checkJs: true`, JS files
are checked loosely, allowing many bugs through.

**Goal:** Enable strict flags one at a time, fixing errors as we go. Each flag
enabled in its own commit.

### Strict flag order (highest ROI first)

| #   | Flag                           | Risk                  | Fix strategy                         |
| --- | ------------------------------ | --------------------- | ------------------------------------ |
| 1   | `noImplicitAny`                | Medium — 30-80 errors | Add explicit types, type annotations |
| 2   | `noUnusedLocals`               | Low — 5-15 errors     | Remove unused variables              |
| 3   | `noUnusedParameters`           | Low — 5-15 errors     | Prefix unused with `_` or remove     |
| 4   | `strictNullChecks`             | High — 100+ errors    | Add null guards, type unions         |
| 5   | `strictFunctionTypes`          | Medium — 20-50 errors | Fix variance in callback types       |
| 6   | `strictBindCallApply`          | Low — 5-10 errors     | Type `.bind()` correctly             |
| 7   | `strictPropertyInitialization` | Medium — 20-50 errors | Add initializers to classes          |

### Rollback condition

If any flag produces >100 errors after fixing everything practical, that flag
gets a `.tsconfig-strict-baseline` file and is deferred. The goal is progress,
not perfection.

### Verification

- `npm run verify:typecheck` — clean at each flag step
- `npx vitest run` — all tests pass
- Each flag is a separate commit with error count documented

---

## 5. Coverage Consolidation (P4)

**Problem:** No coverage for backend tests (node:test). Only frontend has coverage
via `@vitest/coverage-v8`. There is no merged report.

**Goal:** Add backend coverage using Node.js built-in
`--experimental-test-coverage` (available in Node 24+). Create a merged lcov
report.

### Implementation

1. Add `--experimental-test-coverage` to `test:node:coverage` script in package.json
2. Ensure coverage output goes to `coverage/server/` (separate from vitest's `coverage/`)
3. Create `scripts/merge-coverage.mjs` that merges lcov reports from both runners
4. Add npm script `coverage` that runs both and merges

### Verification

- `npm run test:node:coverage` produces lcov output in `coverage/server/`
- `npm run test:coverage` still produces vitest output (frontend only)
- `npm run coverage` produces merged report
- `npm test` is not affected (no coverage by default)

---

## Verification Summary

| Item              | Test command                        | Key assertion                                 |
| ----------------- | ----------------------------------- | --------------------------------------------- |
| 1. Store rename   | `npx vitest run`                    | All tests pass; no imports from `state/`      |
| 2. Error handling | `npm run test:node`                 | All backend tests pass; no inline error sends |
| 3a. Decomp tests  | `npx vitest run --reporter=verbose` | New integration tests pass                    |
| 3b-3e. Decomp     | `wc -l src/PortfolioManagerApp.jsx` | ≤ 800 lines; all tests pass                   |
| 4. Strict mode    | `npm run verify:typecheck`          | Clean at each flag step                       |
| 5. Coverage       | `npm run test:node:coverage`        | Produces lcov output                          |

## Non-Goals

- Refactoring leaf tab components (DashboardTab, HoldingsTab, etc.)
- Changing error envelope shape sent to clients
- Adding Zustand or any state management library
- Writing full unit test coverage for PortfolioManagerApp internals
- Enabling all strict flags in one commit

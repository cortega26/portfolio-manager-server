# Plan 007: Add code splitting for heavy tabs (recharts lazy load)

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md` — unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 21ff5b1..HEAD -- src/PortfolioManagerApp.jsx vite.config.js`
> If these files changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `21ff5b1`, 2026-06-16

## Why this matters

The app ships ~1.4 MB of JavaScript on first load. recharts alone is 448 KB (the `vendor-charts` chunk) but is only needed on 2 of 8 tabs: the Dashboard (charts) and the Reports tab. All other tabs (Holdings, Transactions, Prices, Signals, Settings, Inbox) render no charts but still pay the 448 KB download + parse cost. Using `React.lazy()` to defer loading recharts until a chart-using tab is activated reduces initial JS by 32% and speeds up time-to-interactive. The chunk is already isolated by `manualChunks` in `vite.config.js` — only the dynamic import wiring is missing.

## Current state

- `vite.config.js:57-64` — chunks are already isolated:

  ```js
  manualChunks: {
    'vendor-react': ['react', 'react-dom', 'react-router-dom'],
    'vendor-charts': ['recharts'],
    'vendor-utils': ['decimal.js', 'clsx'],
  },
  ```

- `src/PortfolioManagerApp.jsx:1-30` — all tab components are imported statically at the top:

  ```jsx
  import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
  import AppHeader from './components/AppHeader.jsx';
  import SystemAlerts from './components/SystemAlerts.jsx';
  import TabPanel from './components/TabPanel.jsx';
  // ... all tabs imported eagerly
  ```

  DashboardTab, which uses recharts, is imported among other tab components further down. The ReportsTab or any chart-using component similarly imports recharts eagerly.

- React 18 supports `React.lazy()` and `Suspense` out of the box — no additional dependencies needed.

## Commands you will need

| Purpose        | Command                         | Expected on success                   |
| -------------- | ------------------------------- | ------------------------------------- |
| Build          | `npm run build`                 | exit 0                                |
| Frontend tests | `npx vitest run src/__tests__/` | all pass                              |
| Lint           | `npm run lint`                  | exit 0                                |
| Analyze bundle | `ANALYZE=true npm run build`    | opens bundle visualization (optional) |

## Scope

**In scope**:

- `src/PortfolioManagerApp.jsx` — convert tab imports to `React.lazy()` for chart-heavy components
- Wrap tab rendering in `<Suspense>` with a minimal fallback

**Out of scope**:

- `vite.config.js` — manualChunks config is already correct; do not change
- Non-tab components — only tab-level code splitting
- Route-level code splitting — the app uses tab state, not React Router, for navigation

## Git workflow

- Branch: `advisor/007-code-splitting-heavy-tabs`
- Commit style: `perf: lazy-load chart-heavy tabs to reduce initial bundle size`

## Steps

### Step 1: Identify chart-heavy components

First, determine which tabs import from `recharts`. Run:

```bash
grep -rl "recharts" src/components/ src/
```

Expected: `DashboardTab.jsx` and possibly `ReportsTab.jsx` or `ComparisonView.jsx`. The `DashboardChartsPanel.jsx` also uses recharts. These are the candidates for lazy loading.

### Step 2: Convert chart-heavy tab imports to React.lazy

In `src/PortfolioManagerApp.jsx`, replace static imports of chart-heavy tabs with `React.lazy()`:

```jsx
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';

// Static imports — used on every render (always needed)
import AppHeader from './components/AppHeader.jsx';
import TabPanel from './components/TabPanel.jsx';
// ... other always-needed imports

// Lazy imports — only loaded when the tab is first activated
const DashboardTab = lazy(() => import('./components/DashboardTab.jsx'));
const ComparisonView = lazy(() => import('./components/ComparisonView.jsx'));
// ... add other chart-heavy components
```

### Step 3: Wrap the tab rendering in Suspense

Find where tabs are rendered (likely inside `<TabPanel>` or a switch statement). Wrap with `<Suspense>`:

```jsx
<Suspense fallback={<div className="p-4 text-gray-500">Loading...</div>}>
  {activeTab === 'dashboard' && <DashboardTab {...dashboardProps} />}
  {activeTab === 'comparison' && <ComparisonView {...comparisonProps} />}
  {/* ... other tabs */}
</Suspense>
```

The fallback should be minimal — a simple loading indicator or the existing `LoadingFallback` component if one exists.

### Step 4: Verify the bundle

**Verify**: `npm run build` → exits 0. Then check:

```bash
ls -lh dist/assets/vendor-charts*.js
```

The vendor-charts chunk should still exist but should now be loaded asynchronously (check `dist/index.html` — it should NOT include `vendor-charts` as a `<script>` tag in the head; it should be dynamically imported).

Also: `grep -c "vendor-charts" dist/index.html` → should return `0` (chunk is not in the initial HTML; it's loaded dynamically).

### Step 5: Run tests

**Verify**: `npx vitest run src/__tests__/` → all tests pass. Some tests may need updating if they import the lazy-loaded components directly (tests that render `PortfolioManagerApp` and assert on tab content may need `Suspense` wrappers or `await` for lazy resolution).

## Test plan

- Existing tests should continue to pass. If any test imports a lazy-loaded component directly and renders it without `Suspense`, wrap the test render in `<Suspense>`.
- No new tests are strictly required — this is a loading-strategy change, not a behavioral change.
- **Verification**: `npx vitest run` → all 128 tests pass.

## Done criteria

- [ ] `npm run build` exits 0
- [ ] `grep -c "vendor-charts" dist/index.html` returns `0` (chunk is async-loaded, not in initial HTML)
- [ ] The `vendor-charts` chunk is still created in `dist/assets/` (it exists, just loaded lazily)
- [ ] `npx vitest run` exits 0; all tests pass
- [ ] `npm run lint` exits 0
- [ ] Manual check: open the app (`npm run dev`), navigate to a non-dashboard tab (e.g., Holdings) — no recharts JS should be loaded. Navigate to Dashboard — charts should render correctly.
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- The `vendor-charts` chunk is still referenced in `dist/index.html` after the change — the lazy import isn't working.
- Any tab that uses recharts crashes with "recharts is not defined" — that component wasn't converted to lazy loading correctly.
- Frontend tests fail and can't be fixed by adding `<Suspense>` wrappers — the lazy-load pattern may not be compatible with the test setup (jsdom doesn't support dynamic imports well). If so, consider using a conditional mock in tests or skipping this plan for components that are heavily tested.

## Maintenance notes

- When adding a new tab that uses recharts, always use `React.lazy()` for its import.
- The `LoadingFallback.jsx` component exists in `src/components/` and can be used as the Suspense fallback for a more polished loading state.
- If the app grows to 10+ tabs, consider code-splitting all tabs (not just chart-heavy ones) — the pattern established here generalizes directly.
- `React.lazy()` only works with default exports. If a component uses named exports, create a small wrapper file that re-exports it as default.

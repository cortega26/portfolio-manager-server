# Plan 007: Add code splitting for heavy tabs (recharts lazy load)

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md` — unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat fa0eefe..HEAD -- src/components/TabPanel.jsx vite.config.js`
> If these files changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `fa0eefe`, 2026-06-16 (reconciled from `21ff5b1` due to tab imports moving to `TabPanel.jsx`)

## Why this matters

The app ships ~1.4 MB of JavaScript on first load. recharts alone is 448 KB (the `vendor-charts` chunk) but is only needed on 1 of 12 tabs: the Dashboard (which renders `DashboardChartsPanel`, `AllocationChart`, and `SectorAllocationChart`). All other tabs (Holdings, Transactions, Prices, Signals, Settings, Inbox, History, Metrics, Reports, etc.) render no charts but still pay the 448 KB download + parse cost because `DashboardTab` is imported statically in `TabPanel.jsx`. Using `React.lazy()` to defer loading recharts until the Dashboard tab is activated reduces initial JS by ~32% and speeds up time-to-interactive. The chunk is already isolated by `manualChunks` in `vite.config.js` — only the dynamic import wiring is missing. And `TabPanel.jsx` already imports `Suspense` and wraps tab rendering — the hard infrastructure is in place.

## Current state

- `vite.config.js:59-69` — chunks are already isolated via a function-based `manualChunks`:

  ```js
  manualChunks(id) {
    if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/react-router-dom/')) {
      return 'vendor-react';
    }
    if (id.includes('/recharts/')) {
      return 'vendor-charts';
    }
    if (id.includes('/decimal.js/') || id.includes('/clsx/')) {
      return 'vendor-utils';
    }
  },
  ```

- `src/components/TabPanel.jsx:1-14` — all tab components are imported statically; `Suspense` is already imported and wraps tab rendering (line 63):

  ```jsx
  import { Suspense } from 'react';
  import LoadingFallback from './LoadingFallback.jsx';
  import TodayTab from './review/TodayTab.jsx';
  import DashboardTab from './DashboardTab.jsx';
  // ... 10 more static tab imports

  export default function TabPanel(props) {
    // ... destructure props
    return (
      <Suspense fallback={<LoadingFallback />}>
        {activeTab === 'Today' && (<TodayTab ... />)}
        {activeTab === 'Dashboard' && (<DashboardTab ... />)}
        {/* ... other tabs */}
      </Suspense>
    );
  }
  ```

- Only `DashboardTab` uses recharts (via `DashboardChartsPanel` → recharts, `DashboardZone3` → `AllocationChart` + `SectorAllocationChart` → recharts). No other tab in `TabPanel.jsx` imports recharts directly or transitively.
- `LoadingFallback.jsx` exists in `src/components/` — a ready-made Suspense fallback.

## Commands you will need

| Purpose        | Command                         | Expected on success                   |
| -------------- | ------------------------------- | ------------------------------------- |
| Build          | `npm run build`                 | exit 0                                |
| Frontend tests | `npx vitest run src/__tests__/` | all pass                              |
| Lint           | `npm run lint`                  | exit 0                                |
| Analyze bundle | `ANALYZE=true npm run build`    | opens bundle visualization (optional) |

## Scope

**In scope**:

- `src/components/TabPanel.jsx` — convert `DashboardTab` import to `React.lazy()`

**Out of scope**:

- `vite.config.js` — manualChunks config is already correct; do not change
- `src/PortfolioManagerApp.jsx` — no tab imports here; do not change
- Non-Dashboard tabs — only DashboardTab uses recharts; lazy-loading other tabs adds complexity without bundle-size benefit
- Route-level code splitting — the app uses tab state, not React Router, for navigation

## Git workflow

- Branch: `advisor/007-code-splitting-heavy-tabs`
- Commit style: `perf: lazy-load DashboardTab to defer recharts chunk`

## Steps

### Step 1: Convert DashboardTab import to React.lazy

In `src/components/TabPanel.jsx`, make two changes:

**Change 1**: Add `lazy` to the React import (line 1):

```jsx
// Before:
import { Suspense } from 'react';

// After:
import { lazy, Suspense } from 'react';
```

**Change 2**: Replace the static `DashboardTab` import (line 4) with a lazy import. The lazy import must go AFTER the other static imports, before the component definition:

```jsx
// Remove this line:
import DashboardTab from './DashboardTab.jsx';

// Add this line after the static imports and before `export default function TabPanel`:
const DashboardTab = lazy(() => import('./DashboardTab.jsx'));
```

All other imports remain exactly as they are. The existing `<Suspense fallback={<LoadingFallback />}>` wrapper on line 63 already handles the loading state — no JSX changes needed.

### Step 2: Verify the build

**Verify**: `npm run build` → exits 0. Then check:

```bash
ls -lh dist/assets/vendor-charts*.js
```

The vendor-charts chunk should still exist.

Then:

```bash
grep -c "vendor-charts" dist/index.html
```

Expected: `0` — the chunk is no longer in the initial HTML; it's dynamically imported.

### Step 3: Run tests

**Verify**: `npx vitest run src/__tests__/` → all tests pass.

The tests that import `DashboardTab` or render `TabPanel` with `activeTab="Dashboard"` may need attention. If any test renders a lazy component without `<Suspense>`, it will throw. The fix is to wrap that test's render in `<Suspense fallback={<div>Loading</div>}>`.

If tests fail because jsdom doesn't support dynamic `import()` (lazy resolution), follow the project's existing test patterns — check `src/__tests__/setupTests.ts` to see if there's already a mock for `React.lazy`. If not, add one:

```js
// In setupTests.ts or the failing test file:
vi.mock('react', async () => {
  const actual = await vi.importActual('react');
  return {
    ...actual,
    lazy: (factory) => {
      const LazyComponent = actual.lazy(factory);
      // Pre-resolve for tests
      return factory().then((mod) => mod.default || mod);
    },
  };
});
```

**STOP condition**: if this pattern doesn't work and multiple tests fail with no clear path forward, stop and report.

### Step 4: Run lint

**Verify**: `npm run lint` → exits 0.

## Test plan

- Existing tests should continue to pass.
- If `DashboardTab` or `TabPanel` tests fail due to lazy loading not resolving in jsdom, use the mock pattern described in Step 3.
- No new tests are required — this is a loading-strategy change, not a behavioral change.

## Done criteria

- [ ] `npm run build` exits 0
- [ ] `grep -c "vendor-charts" dist/index.html` returns `0` (chunk is async-loaded, not in initial HTML)
- [ ] The `vendor-charts` chunk is still created in `dist/assets/` (it exists, just loaded lazily)
- [ ] `npx vitest run src/__tests__/` exits 0; all tests pass
- [ ] `npm run lint` exits 0
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated (EXCEPT if dispatched by a reviewer who maintains the index)

## STOP conditions

Stop and report back if:

- The `vendor-charts` chunk is still referenced in `dist/index.html` after the change — the lazy import isn't working.
- The Dashboard tab crashes with "recharts is not defined" or a blank loading state that never resolves.
- Frontend tests fail and can't be fixed by the patterns described in Step 3.
- `npm run build` fails with a chunk resolution error.

## Maintenance notes

- When adding a new tab that uses recharts, always use `React.lazy()` for its import in `TabPanel.jsx`.
- `LoadingFallback.jsx` is already used as the Suspense fallback — no need to create a new one.
- If the app grows to 10+ tabs, consider code-splitting all tabs (not just DashboardTab) — the pattern established here generalizes directly.
- `React.lazy()` only works with default exports. `DashboardTab` uses a default export (`export default function DashboardTab`), so no wrapper is needed.

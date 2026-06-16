# Plan 012: Review-first shell — connect review components as the default app entry point

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md` — unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 21ff5b1..HEAD -- src/PortfolioManagerApp.jsx src/components/review/ src/components/shared/ shared/policy.js`
> If these files changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED
- **Depends on**: 011 (trust layer backend metadata must land first — the review components consume trust metadata)
- **Category**: direction
- **Planned at**: commit `21ff5b1`, 2026-06-16

## Why this matters

The codebase has five fully built but disconnected review components under `src/components/review/` (TodayTab, NeedsAttentionSection, RecentChangesSection, DataBlockersSection, PortfolioHealthBar) and two trust components under `src/components/shared/` (TrustBadge, TrustTooltip). These represent a "review-first" UX model — instead of 8 data tabs, the user lands on a daily review dashboard that surfaces what needs attention. The strategic redesign plan defines this as EPIC-2 with 7 tickets, all `todo`. This plan connects the existing components into the app shell behind a feature flag, making the review-first experience the default while keeping the classic tab layout as a fallback. This is the highest-leverage product improvement per unit of effort because the components already exist — only the wiring is missing.

This is a **design/spike plan**: the components exist and have data contracts, but the exact integration points and data wiring require exploration.

## Current state

- `src/components/review/TodayTab.jsx` — full component, imported but not wired as default tab
- `src/components/review/NeedsAttentionSection.jsx` — lists items needing review
- `src/components/review/RecentChangesSection.jsx` — shows recent NAV/price changes
- `src/components/review/DataBlockersSection.jsx` — shows what's blocking data quality
- `src/components/review/PortfolioHealthBar.jsx` — health score visualization
- `src/components/shared/TrustBadge.jsx` — trust level badge
- `src/components/shared/TrustTooltip.jsx` — explains trust level
- `shared/policy.js` — `evaluatePolicy` function (tested but unused in production)

- `src/PortfolioManagerApp.jsx:749` — the current tab rendering area. The `TodayTab` may already be referenced here via the `todayShell` flag (which plan 005 cleans up):
  ```jsx
  showTodayTab={getFlag(resolveFlags(), 're设计.todayShell')}
  ```

## Commands you will need

| Purpose              | Command                    | Expected on success                   |
| -------------------- | -------------------------- | ------------------------------------- |
| Full test suite      | `npm test`                 | all pass                              |
| Lint                 | `npm run lint`             | exit 0                                |
| Typecheck (frontend) | `npm run verify:typecheck` | exit 0                                |
| Dev server           | `npm run dev`              | starts on :5173 (manual verification) |

## Scope

**In scope**:

- `src/PortfolioManagerApp.jsx` — set TodayTab as the default landing tab
- `src/components/review/TodayTab.jsx` — verify it has complete data contracts; add missing data fetching if needed
- `src/components/review/` sub-components — verify each receives its props from TodayTab or from a shared data source
- `src/lib/featureFlags.js` — add `'re设计.reviewShell'` flag (default `true`) for the toggle

**Out of scope**:

- `shared/policy.js` — the policy evaluator is useful but wiring it is a separate task
- New backend endpoints — the review components should work with existing API data; if they need new endpoints, those should be separate plans
- Removing the classic tab layout — it stays as a fallback
- Creating new review components — only wiring existing ones

## Git workflow

- Branch: `advisor/012-review-first-shell`
- Commit style: `feat: wire review-first Today tab as default app landing behind feature flag`

## Steps

### Step 1: Audit existing review components for data completeness

Read each review component and identify what data it expects (props, context, hooks). For each, verify the data is available from existing API calls in `PortfolioManagerApp.jsx`:

```bash
grep -rn "export\|props\|usePortfolio\|fetch" src/components/review/*.jsx
```

Expected: most components consume data that `PortfolioManagerApp.jsx` already fetches (portfolio state, prices, signals, benchmarks). If any component calls an API endpoint that doesn't exist, document it and treat as a STOP condition.

### Step 2: Add the feature flag

In `src/lib/featureFlags.js`, add:

```js
're设计.reviewShell': true,
```

This flag controls whether the Today tab is the default landing. When `true`, the app opens to the review dashboard. When `false`, it opens to the classic Dashboard tab.

### Step 3: Set TodayTab as the default active tab

In `src/PortfolioManagerApp.jsx`, find where the initial `activeTab` state is set (likely in the reducer or a `useState` call). Change the default from `'dashboard'` to `'today'` when the feature flag is enabled:

```jsx
const defaultTab = getFlag(resolveFlags(), 're设计.reviewShell') ? 'today' : 'dashboard';
const [activeTab, setActiveTab] = useState(defaultTab);
```

### Step 4: Wire TodayTab into the tab rendering

Ensure TodayTab is rendered when `activeTab === 'today'`. If TodayTab is already rendered (based on the `todayShell` flag from plan 005), verify it receives all needed props from the parent's state:

```jsx
{
  activeTab === 'today' && (
    <TodayTab
      portfolioId={portfolioId}
      holdings={holdings}
      currentPrices={currentPrices}
      signals={signals}
      benchmarkSummary={benchmarkSummary}
      trustMetadata={trustMetadata} // from plan 011
      // ... other props as needed
    />
  );
}
```

If `TodayTab` is currently behind the `todayShell` flag, remove the flag check and just use the tab state.

### Step 5: Add a "Classic View" toggle

Add a small link or button in the tab bar or settings that switches back to the classic tab layout. This gives users an escape hatch:

```jsx
// In the tab bar or header
<button
  onClick={() => setActiveTab('dashboard')}
  className="text-sm text-gray-500 hover:text-gray-700"
>
  Classic View
</button>
```

### Step 6: Run the full quality gate

**Verify**: `npm test && npm run lint && npm run verify:typecheck` → all exit 0.

## Test plan

- Update existing tests that assert on the default active tab (`DashboardTab` rendered first). Change assertions to expect `TodayTab` when the feature flag is enabled.
- Add a test: "when reviewShell flag is true, Today tab is the default":
  - Set `localStorage` flag to `true`
  - Render `PortfolioManagerApp`
  - Assert `TodayTab` is visible
- Add a test: "when reviewShell flag is false, Dashboard tab is the default"
- **Verification**: `npx vitest run` → all tests pass.

## Done criteria

- [ ] TodayTab is the default landing tab when `re设计.reviewShell` flag is `true`
- [ ] A "Classic View" link/toggle switches back to the tab layout
- [ ] All review sub-components render with real data (no blank sections)
- [ ] The `re设计.reviewShell` flag in localStorage can disable the feature
- [ ] `npm test` exits 0; all tests pass
- [ ] `npm run lint` exits 0
- [ ] `npm run verify:typecheck` exits 0
- [ ] Manual check: `npm run dev`, open the app — Today tab loads as the landing page with review sections populated
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- Any review component requires data from an API endpoint that doesn't exist. The component was built against a planned but not-yet-implemented endpoint. Document which endpoint is needed and create a follow-up plan.
- The review components crash on render because of missing props. Trace the prop requirements and identify the data gap.
- The "Classic View" toggle is confusing or breaks the navigation — the tab state management in `PortfolioManagerApp.jsx` may need refactoring to support two layout modes. If so, limit scope to just setting Today as default and keeping the tab bar visible.
- Plan 011 (trust layer) is not yet DONE — the review components may render but with empty/placeholder trust badges. This is acceptable for an initial integration but not for production.

## Maintenance notes

- The review-first UX is the intended end state. After a settling period (2-4 weeks of usage), the classic tab layout can be removed entirely and the feature flag retired.
- `shared/policy.js` contains a `evaluatePolicy` function that computes review cadence recommendations. It's not wired in this plan but is the natural next step for enriching the review dashboard.
- The strategic redesign plan in `docs/implementation/portfolio-manager-strategic-redesign-plan.md` has detailed acceptance criteria for each review component. Consult it when iterating.

# Plan 016: Hoist constant Decimal allocations out of the ROI benchmark hot loops

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 2de7edc..HEAD -- src/utils/roi.js`
> If `roi.js` changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as
> a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `2de7edc`, 2026-07-01

## Why this matters

The dashboard chart overlay is built by `DashboardChartsPanel.jsx`, whose
`roiChartData` `useMemo` calls `buildFlowMatchedBenchmarkSeries(...)` once per
benchmark series (`['spy', 'qqq', 'blended', 'exCash', 'cash']` — 5 calls) and
each call walks the full ROI date series. Inside those per-row loops the code
constructs brand-new `new Decimal(0)` / `new Decimal(1)` objects on **every
iteration**. `decimal.js` construction is comparatively expensive (parse +
precision setup). For a multi-year daily series this is thousands of throwaway
allocations each time the memo recomputes (on every price refresh, nightly
update, or portfolio switch). `Decimal` instances are immutable — every
operation returns a new instance and never mutates its operands — so these
constants can be allocated once at module scope and shared. The output is
**byte-for-byte identical**; this is a pure, safe micro-architectural cleanup
with the existing ROI tests as the safety net.

Honest scoping note: this does **not** claim a "every render" win — the memo is
already gated on `[roiData, transactions]`. The win is fewer allocations each
time that data actually changes, and it removes an obvious waste from the
hottest finance loop in the frontend.

## Current state

`src/utils/roi.js` imports Decimal at the top:

```js
import Decimal from 'decimal.js';
```

**In-loop constant allocations to hoist** (these run once per row/date):

- `buildDailyReturnLookupFromCumulativeSeries` (loop starts line 383):
  - line 396: `dailyReturns.set(row.date, new Decimal(0));`
- `buildFlowMatchedBenchmarkSeries` (loop starts line 428):
  - line 430: `const netContributions = cumulativeFlows.get(date) ?? new Decimal(0);`
  - line 444: `const dailyReturn = dailyReturnLookup.get(date) ?? new Decimal(0);`
  - line 445: `syntheticNav = syntheticNav.times(new Decimal(1).plus(dailyReturn)).plus(flow);`

**Leave these alone** — they construct value-dependent Decimals, not constants:

- line 389: `new Decimal(cumulativePct)` — argument varies per row.
- line 359 and line 425: `new Decimal(0)` that run **once per function call**
  (before the loop). Replacing them with the shared constant is harmless but
  not required; the required targets are the four in-loop sites above.

Only one production caller of `buildFlowMatchedBenchmarkSeries` exists
(`src/components/dashboard/DashboardChartsPanel.jsx:396`); the function is also
exercised directly by `src/__tests__/roi.test.js:181`.

## Commands you will need

| Purpose           | Command                                             | Expected on success |
| ----------------- | --------------------------------------------------- | ------------------- |
| ROI unit tests    | `npx vitest run src/__tests__/roi.test.js`          | all pass            |
| ROI property test | `npx vitest run src/__tests__/roi.property.test.js` | all pass            |
| Full frontend     | `npx vitest run`                                    | all pass            |
| Lint              | `npm run lint`                                      | exit 0              |
| Typecheck         | `npm run verify:typecheck`                          | exit 0              |

## Scope

**In scope** (the only file you should modify):

- `src/utils/roi.js`

**Out of scope** (do NOT touch):

- `src/components/dashboard/DashboardChartsPanel.jsx` — do NOT change the
  5-call `reduce` structure or the `buildFlowMatchedBenchmarkSeries` signature.
  Passing a pre-computed cumulative-flow map to avoid recomputing it 5× is a
  reasonable follow-up but adds coupling and is deliberately **out of scope**
  here (see Maintenance notes).
- Any change to numeric output. This is a zero-behavior-change refactor.

## Git workflow

- Branch: `advisor/016-roi-decimal-constant-hoisting`
- Commit style: conventional commits (e.g.
  `perf: hoist constant Decimal allocations out of ROI benchmark loops`).

## Steps

### Step 1: Define shared module-level constants

In `src/utils/roi.js`, immediately after the imports (before
`SERIES_META_FALLBACK` on line 9), add:

```js
// Reusable immutable Decimal constants — decimal.js instances are immutable,
// so sharing these avoids per-iteration allocations in the benchmark loops.
const DECIMAL_ZERO = new Decimal(0);
const DECIMAL_ONE = new Decimal(1);
```

First `grep -n "DECIMAL_ZERO\|DECIMAL_ONE\|const ZERO\|const ONE" src/utils/roi.js`
to make sure those names aren't already taken; if an equivalent constant
already exists, reuse it instead of adding a duplicate.

**Verify**: `npm run lint` → exit 0.

### Step 2: Replace the four in-loop constant constructions

Make exactly these substitutions in `src/utils/roi.js`:

- line 396: `new Decimal(0)` → `DECIMAL_ZERO`
- line 430: `new Decimal(0)` → `DECIMAL_ZERO`
- line 444: `new Decimal(0)` → `DECIMAL_ZERO`
- line 445: `new Decimal(1)` → `DECIMAL_ONE`
  (i.e. `syntheticNav.times(DECIMAL_ONE.plus(dailyReturn)).plus(flow)`)

Do **not** change line 389 (`new Decimal(cumulativePct)`).

**Verify**: `grep -n "new Decimal(0)\|new Decimal(1)" src/utils/roi.js` shows no
matches inside the loop bodies of the two named functions (only the
pre-loop/value sites remain, if you chose to leave them).

### Step 3: Confirm identical output via the existing tests

**Verify**:

- `npx vitest run src/__tests__/roi.test.js` → all pass, unchanged.
- `npx vitest run src/__tests__/roi.property.test.js` → all pass, unchanged.

The property test compares series across many generated inputs; if the output
were different, it would fail. Passing here is the proof of zero behavior
change.

## Test plan

- No new tests required — this is a behavior-preserving refactor covered by the
  existing `roi.test.js` and `roi.property.test.js`.
- Verification: `npx vitest run` → all pass (no regressions anywhere).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `DECIMAL_ZERO` and `DECIMAL_ONE` (or reused equivalents) exist at module scope in `src/utils/roi.js`
- [ ] The four in-loop sites (396, 430, 444, 445) use the constants, not `new Decimal(...)`
- [ ] `npx vitest run src/__tests__/roi.test.js` → all pass
- [ ] `npx vitest run src/__tests__/roi.property.test.js` → all pass
- [ ] `npx vitest run` → all pass
- [ ] `npm run lint` exits 0 and `npm run verify:typecheck` exits 0
- [ ] `git status` shows only `src/utils/roi.js` changed
- [ ] `plans/README.md` status row for 016 updated

## STOP conditions

Stop and report back (do not improvise) if:

- `roi.js` no longer matches the "Current state" line references (drift) — the
  line numbers moved; re-locate the four in-loop constant constructions by
  reading the two named functions before editing.
- `roi.property.test.js` or `roi.test.js` fails after the change — that means
  the substitution was not behavior-preserving (e.g. you accidentally replaced
  the value-dependent `new Decimal(cumulativePct)` on line 389); revert and
  report.

## Maintenance notes

- **Deferred follow-up (bigger win, more risk)**: `DashboardChartsPanel.jsx`
  calls `buildFlowMatchedBenchmarkSeries` 5× with the same `roiData` +
  `transactions`, so `buildCumulativeExternalFlowMap` runs 5× to produce
  identical maps. A future plan could compute the cumulative-flow map once and
  pass it in via a new optional parameter. That changes the function signature
  and touches the component, so it was kept separate.
- A reviewer should confirm no `new Decimal(cumulativePct)` (or any
  value-dependent construction) was replaced by a constant.

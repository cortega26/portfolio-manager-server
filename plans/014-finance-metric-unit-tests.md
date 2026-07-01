# Plan 014: Add unit tests for the untested finance metric functions (Sharpe, drawdown, rolling returns)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 2de7edc..HEAD -- server/finance/returns.ts`
> If `returns.ts` changed since this plan was written, compare the "Current
> state" signatures/excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `2de7edc`, 2026-07-01

## Why this matters

Three money-path metric functions in the finance engine have **zero direct
test coverage** — verified: `grep -rln "computeSharpeRatio\|computeCurrentDrawdown\|computeRollingWindowReturns" server/__tests__/ tests/`
returns nothing. They are consumed by the analytics/benchmarks endpoints
(`server/routes/analytics.ts`), so today the only thing exercising them is slow
API/E2E paths. If the math regresses, nothing catches it in isolation. These
are pure, deterministic functions — ideal for cheap, fast unit tests that lock
in behavior and make future refactors safe. This is purely additive: **no
production code changes**.

## Current state

All three functions live in `server/finance/returns.ts` and are already
exported. Their exact signatures and behavior:

- `computeSharpeRatio(rows: ReturnRow[], annualRiskFreeRate?: number): number | null`
  (line ~1055). Returns `null` when `rows.length < 2`. Builds daily excess
  returns as `r_port - (Number.isFinite(r_cash) ? r_cash : dailyRf)` where
  `dailyRf` derives from `annualRiskFreeRate` (default `0.05`). Computes mean,
  sample variance (`/(n-1)`), std. **Returns `null` when `std < 1e-15`** (e.g.
  constant excess returns). Otherwise returns
  `round((mean / std) * sqrt(252), 4)`.

- `computeCurrentDrawdown(rows: ReturnRow[]): { currentDrawdown, peakDate, currentDate } | null`
  (line 1082). Returns `null` when `rows.length < 2`. Walks a cumulative growth
  product `cumulative *= (1 + r_port)` **starting from the second row** (the
  first row's `r_port` is not applied — `cumulative` starts at `1`). Tracks the
  running peak and its date. `currentDrawdown = round((cumulative - peak)/peak, 6)`
  (0 when at a new peak). `currentDate` is the last row's date.

- `computeRollingWindowReturns(rows: ReturnRow[]): { oneMonth, threeMonth, oneYear }`
  (line 1121). Each field is `{ cumulative: number | null; annualized: number | null }`.
  Windows are 21 / 63 / 252 trading days. For a window of `days`, if
  `rows.length < days + 1` the field is `{ cumulative: null, annualized: null }`.
  Otherwise cumulative = `round(product(1 + r_port over last `days` rows) - 1, 6)`;
  `annualized` is only non-null for `days >= 252`.

- `ReturnRow` shape (line 33): `{ date, r_port, r_ex_cash, r_bench_blended, r_spy_100, r_qqq_100, r_cash }` — all numeric except `date` (ISO string). **These three functions only read `r_port` and `r_cash`**, so a test helper may fill the rest with `0`.

Test conventions (backend / `node:test`):

- Tests import compiled-by-loader modules with a `.js` extension even though
  the source is `.ts`. Example from `server/__tests__/tradeStats.test.js`:
  ```js
  import { describe, it } from 'node:test';
  import assert from 'node:assert/strict';
  import { computeTradeStats } from '../finance/tradeStats.js';
  ```

## Commands you will need

| Purpose             | Command                                                                                            | Expected on success |
| ------------------- | -------------------------------------------------------------------------------------------------- | ------------------- |
| Run this test alone | `node --import ./server/__tests__/setup/global.js --test server/__tests__/returns.metrics.test.js` | all pass            |
| All backend tests   | `npm run test:node`                                                                                | all pass            |
| Lint                | `npm run lint`                                                                                     | exit 0              |
| Typecheck (server)  | `npm run verify:typecheck:server`                                                                  | exit 0              |

## Scope

**In scope** (the only file you should create):

- `server/__tests__/returns.metrics.test.js` (create)

**Out of scope** (do NOT touch):

- `server/finance/returns.ts` — this plan is test-only. If a test reveals what
  looks like a **bug** in one of these functions, **do NOT fix it here** —
  follow the STOP condition and report it.
- Any other test file.

## Git workflow

- Branch: `advisor/014-finance-metric-unit-tests`
- Commit style: conventional commits (e.g.
  `test: add unit tests for Sharpe, drawdown, and rolling-window returns`).

## Steps

### Step 1: Create the test file with a row helper

Create `server/__tests__/returns.metrics.test.js`. Start with imports and a
helper that builds a minimal `ReturnRow`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeSharpeRatio,
  computeCurrentDrawdown,
  computeRollingWindowReturns,
} from '../finance/returns.js';

// These functions only read `date`, `r_port`, and `r_cash`.
function makeRow(date, r_port, r_cash = 0) {
  return {
    date,
    r_port,
    r_ex_cash: 0,
    r_bench_blended: 0,
    r_spy_100: 0,
    r_qqq_100: 0,
    r_cash,
  };
}
```

### Step 2: Sharpe ratio tests

Add a `describe('computeSharpeRatio', ...)` block with these cases (the
expected values below are derived from the algorithm in "Current state"):

- Empty array → `null`: `assert.equal(computeSharpeRatio([]), null)`.
- One row → `null`: `assert.equal(computeSharpeRatio([makeRow('2024-01-01', 0.01)]), null)`.
- **Constant excess returns → `null`** (std is 0): three rows all with
  `r_port = 0.01`, `r_cash = 0`, called with `annualRiskFreeRate = 0`. Excess
  is `[0.01, 0.01, 0.01]` → variance 0 → `null`.
- **Varying positive excess → a positive finite number**: rows with
  `r_port = [0.01, 0.02, 0.03]`, `r_cash = 0`, `annualRiskFreeRate = 0`. Assert
  `typeof result === 'number'`, `Number.isFinite(result)`, and `result > 0`.
  (Do not assert an exact value — mean/std/annualization make it brittle.)

### Step 3: Current drawdown tests

Add a `describe('computeCurrentDrawdown', ...)` block:

- Empty / single row → `null`.
- **At a new peak → drawdown 0**: rows
  `[makeRow('d0', 0), makeRow('d1', 0.10), makeRow('d2', 0.10)]`. Growth:
  `1 → 1.10 → 1.21`, peak ends at the last row. Assert
  `result.currentDrawdown === 0`, `result.peakDate === 'd2'`,
  `result.currentDate === 'd2'`.
- **Peak then decline → negative drawdown**: rows
  `[makeRow('d0', 0), makeRow('d1', 0.10), makeRow('d2', -0.50)]`. Growth:
  `1 → 1.10 → 0.55`; peak `1.10` at `d1`; drawdown `(0.55 - 1.10)/1.10 = -0.5`.
  Assert `result.currentDrawdown === -0.5`, `result.peakDate === 'd1'`,
  `result.currentDate === 'd2'`.

### Step 4: Rolling window returns tests

Add a `describe('computeRollingWindowReturns', ...)` block:

- Empty array → all three windows null:
  `assert.equal(computeRollingWindowReturns([]).oneMonth.cumulative, null)`.
- **Insufficient rows → null**: 10 rows → `oneMonth.cumulative === null`
  (needs at least 22 rows). Build with a loop:
  `Array.from({ length: 10 }, (_, i) => makeRow('d' + i, 0))`.
- **Exactly 22 flat rows → oneMonth cumulative 0**:
  `Array.from({ length: 22 }, (_, i) => makeRow('d' + i, 0))`. The 21-day window
  of all-zero returns has cumulative `0`. Assert
  `result.oneMonth.cumulative === 0`, `result.oneMonth.annualized === null`
  (21 < 252), and `result.threeMonth.cumulative === null` (22 < 64).

### Step 5: Run and confirm

**Verify**:
`node --import ./server/__tests__/setup/global.js --test server/__tests__/returns.metrics.test.js`
→ all tests pass (expect ~10 test cases).

## Test plan

- New file `server/__tests__/returns.metrics.test.js`, structural pattern:
  `server/__tests__/tradeStats.test.js` (same imports, `describe`/`it`,
  `node:assert/strict`).
- Cases per function: null/empty guards, the documented `null`-return edge
  (constant excess for Sharpe; insufficient rows for rolling), and at least one
  known-value happy path.
- Verification: `npm run test:node` → all pass, including the new file.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `server/__tests__/returns.metrics.test.js` exists and imports all three functions
- [ ] `node --import ./server/__tests__/setup/global.js --test server/__tests__/returns.metrics.test.js` → all pass, ≥ 8 test cases
- [ ] `npm run test:node` → all pass (no regressions)
- [ ] `npm run lint` exits 0
- [ ] `git status` shows only the one new test file added
- [ ] `plans/README.md` status row for 014 updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any documented expected value in Steps 2–4 does **not** match the actual
  function output. That means either the plan's hand-computed value is wrong or
  the function has a **bug** — either way, report the exact input, expected, and
  actual; do NOT edit `returns.ts` to make a test pass, and do NOT weaken an
  assertion to `assert.ok(true)` just to get green.
- The import of any of the three functions fails (the export was renamed/moved
  — drift).
- `returns.ts` no longer matches the "Current state" signatures.

## Maintenance notes

- If `computeSharpeRatio`'s default `annualRiskFreeRate` (currently `0.05`) or
  the trading-day constant (252) changes, the "varying positive excess" test
  stays valid (it only asserts sign/finiteness), but any future exact-value
  tests would need updating.
- A natural follow-up (separate plan): add `fast-check` property tests
  (model after `server/__tests__/returns.property.test.js`) — e.g. Sharpe is
  scale-invariant to a constant added to every return only via the risk-free
  term; drawdown is always ≤ 0.
- A reviewer should confirm the tests assert real values, not just that the
  functions "ran without throwing."

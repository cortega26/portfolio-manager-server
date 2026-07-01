# Plan 015: Consolidate the duplicated `yearFromDate` helper into a shared module

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 2de7edc..HEAD -- server/finance/dividends.ts server/finance/tradeStats.ts`
> If either file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `2de7edc`, 2026-07-01

## Why this matters

Two finance modules each define a private function named `yearFromDate` that
extracts the year from an ISO date string — but with **different return types
and different fallbacks**, which is exactly the kind of drift that causes
subtle bugs later (someone "fixes" one and forgets the other, or assumes they
behave identically because they share a name). Consolidating them into one
shared module with two clearly-named exports removes the name collision and
makes the behavioral difference explicit and intentional. Small, mechanical,
low-risk — the existing tests for both modules lock in behavior.

## Current state

- `server/finance/dividends.ts:81` — returns a **number**, falls back to `0`:

  ```ts
  function yearFromDate(d: string): number {
    return Number.parseInt(d.slice(0, 4), 10) || 0;
  }
  ```

  Used at `dividends.ts:140`: `const txYear = yearFromDate(date);`

- `server/finance/tradeStats.ts:80` — returns a **string**, falls back to
  `'Unknown'`:

  ```ts
  function yearFromDate(date: string): string {
    if (date.length >= 4) return date.slice(0, 4);
    return 'Unknown';
  }
  ```

  Used at `tradeStats.ts:212`: `const yearKey = yearFromDate(lot.sellDate);`

- **These are NOT interchangeable.** `dividends` uses the numeric year as a
  grouping key; `tradeStats` uses the string label (including the literal
  `'Unknown'`) as a `byYear` grouping key that surfaces in API output. You must
  preserve each one's exact behavior — do not "unify" them into a single
  function that changes either return type or fallback.

- Exemplar for a small shared finance helper module:
  `server/finance/decimal.ts` — a flat module of single-purpose exported
  helpers with a `// server/finance/<name>.ts` header comment. Match that
  style. Modules import sibling helpers with a `.js` extension
  (e.g. `import { d } from './decimal.js';`).

## Commands you will need

| Purpose            | Command                                                                                       | Expected on success |
| ------------------ | --------------------------------------------------------------------------------------------- | ------------------- |
| dividends tests    | `node --import ./server/__tests__/setup/global.js --test server/__tests__/dividends.test.js`  | all pass            |
| tradeStats tests   | `node --import ./server/__tests__/setup/global.js --test server/__tests__/tradeStats.test.js` | all pass            |
| All backend tests  | `npm run test:node`                                                                           | all pass            |
| Lint               | `npm run lint`                                                                                | exit 0              |
| Typecheck (server) | `npm run verify:typecheck:server`                                                             | exit 0              |

## Scope

**In scope**:

- `server/finance/dateHelpers.ts` (create)
- `server/finance/dividends.ts` (replace local function with import)
- `server/finance/tradeStats.ts` (replace local function with import)

**Out of scope** (do NOT touch):

- Any other date logic in the repo. A broader date-helper consolidation
  (`cash.ts`, `returns.ts`, `historicalPriceLoader.js` all have their own date
  helpers) is a **separate, larger plan** — do not expand into it here.
- The behavior/return type of either function — preserve exactly.

## Git workflow

- Branch: `advisor/015-consolidate-year-from-date`
- Commit style: conventional commits (e.g.
  `refactor: extract yearFromDate helpers into shared dateHelpers module`).

## Steps

### Step 1: Create the shared module

Create `server/finance/dateHelpers.ts` with two clearly-named exports that
preserve each caller's exact behavior:

```ts
// server/finance/dateHelpers.ts

/**
 * Numeric 4-digit year from an ISO date string; `0` when unparseable.
 * Preserves the previous `dividends.ts` behavior exactly.
 */
export function yearNumberFromDate(date: string): number {
  return Number.parseInt(date.slice(0, 4), 10) || 0;
}

/**
 * 4-character year label from an ISO date string; `'Unknown'` when the string
 * is too short. Preserves the previous `tradeStats.ts` behavior exactly.
 */
export function yearLabelFromDate(date: string): string {
  if (date.length >= 4) return date.slice(0, 4);
  return 'Unknown';
}
```

**Verify**: `npm run verify:typecheck:server` → exit 0.

### Step 2: Repoint `dividends.ts`

In `server/finance/dividends.ts`:

- Delete the local `function yearFromDate(d: string): number { ... }` (lines ~81–83).
- Add an import near the other imports:
  `import { yearNumberFromDate } from './dateHelpers.js';`
- At line ~140, change `yearFromDate(date)` to `yearNumberFromDate(date)`.

**Verify**: `node --import ./server/__tests__/setup/global.js --test server/__tests__/dividends.test.js` → all pass.

### Step 3: Repoint `tradeStats.ts`

In `server/finance/tradeStats.ts`:

- Delete the local `function yearFromDate(date: string): string { ... }` (lines ~80–83).
- Add an import: `import { yearLabelFromDate } from './dateHelpers.js';`
- At line ~212, change `yearFromDate(lot.sellDate)` to `yearLabelFromDate(lot.sellDate)`.

**Verify**: `node --import ./server/__tests__/setup/global.js --test server/__tests__/tradeStats.test.js` → all pass.

### Step 4: Confirm no stray references remain

**Verify**:

- `grep -rn "function yearFromDate" server/finance/` → no matches.
- `grep -rn "yearFromDate" server/finance/dividends.ts server/finance/tradeStats.ts` → no matches (both now call the new names).

## Test plan

- No new tests are required — the change is behavior-preserving and the
  existing `dividends.test.js` and `tradeStats.test.js` (which assert on
  `byYear` output) are the regression net.
- Optional (nice to have): add `server/__tests__/dateHelpers.test.js` asserting
  `yearNumberFromDate('2024-06-01') === 2024`, `yearNumberFromDate('xx') === 0`,
  `yearLabelFromDate('2024-06-01') === '2024'`, `yearLabelFromDate('24') === 'Unknown'`.
  If you add it, model it after `tradeStats.test.js`.
- Verification: `npm run test:node` → all pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `server/finance/dateHelpers.ts` exists with `yearNumberFromDate` and `yearLabelFromDate`
- [ ] `grep -rn "function yearFromDate" server/finance/` → no matches
- [ ] `node --import ./server/__tests__/setup/global.js --test server/__tests__/dividends.test.js` → all pass
- [ ] `node --import ./server/__tests__/setup/global.js --test server/__tests__/tradeStats.test.js` → all pass
- [ ] `npm run test:node` → all pass
- [ ] `npm run lint` exits 0 and `npm run verify:typecheck:server` exits 0
- [ ] `git status` shows only the three in-scope files (plus optional test)
- [ ] `plans/README.md` status row for 015 updated

## STOP conditions

Stop and report back (do not improvise) if:

- Either `dividends.ts` or `tradeStats.ts` no longer matches the "Current
  state" excerpt (drift).
- Any existing test in `dividends.test.js` or `tradeStats.test.js` changes
  result — that means behavior was not preserved; revert and report.
- You find a **third** `yearFromDate` (or equivalent) elsewhere that you feel
  tempted to fold in — stop; that belongs to the separate date-consolidation
  plan, not this one.

## Maintenance notes

- **Deferred follow-up**: a broader `dateHelpers` consolidation covering
  `toDateKey` / `toCanonicalDate` / `previousDate` / `resolveDateWindow`
  scattered across `cash.ts`, `returns.ts`, `dividends.ts`, `tradeStats.ts`,
  and `historicalPriceLoader.js`. That is higher-risk (timezone-sensitive,
  money-adjacent) and should be its own plan with its own tests.
- A reviewer should confirm the two helper names are used by the correct
  caller (number version in `dividends`, label version in `tradeStats`) — a
  swap would silently corrupt `byYear` groupings.

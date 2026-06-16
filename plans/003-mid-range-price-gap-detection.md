# Plan 003: Fix mid-range price gap detection in performance history rebuild

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md` — unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 21ff5b1..HEAD -- server/services/performanceHistory.js server/__tests__/performance_history.test.js`
> If these files changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `21ff5b1`, 2026-06-16

## Why this matters

`buildPriceFetchWindows` determines which date ranges need price data fetched. It currently only detects gaps at the _prefix_ (before the first existing date) and _suffix_ (after the last existing date). If a middle segment is missing — e.g., rows exist for Jan 1 and Jan 30, but Jan 15–20 are absent — the gap is never detected. The downstream `rebuildPersistentSeries` or `ensurePriceCoverage` then produces incomplete data, and the user sees stale or flat benchmark series with no warning. The nightly `daily_close` job depends on this function, so the corruption is silent and persistent.

## Current state

- `server/services/performanceHistory.js:107-143` — the function only checks prefix and suffix:

  ```js
  function buildPriceFetchWindows(rows, from, to) {
    const requestedFrom = toDateKey(from);
    const requestedTo = toDateKey(to);
    if (requestedFrom > requestedTo) {
      return [];
    }
    const dates = Array.from(
      new Set(
        rows
          .map((row) => (typeof row?.date === 'string' ? row.date.trim() : ''))
          .filter((date) => date.length > 0)
      )
    ).sort((left, right) => left.localeCompare(right));

    if (dates.length === 0) {
      return [{ from: requestedFrom, to: requestedTo }];
    }

    const windows = [];
    const firstDate = dates[0];
    const lastDate = dates[dates.length - 1];

    if (requestedFrom < firstDate) {
      const prefixEnd = previousDateKey(firstDate);
      if (requestedFrom <= prefixEnd) {
        windows.push({ from: requestedFrom, to: prefixEnd });
      }
    }

    if (requestedTo > lastDate) {
      const suffixStart = nextDateKey(lastDate);
      if (suffixStart <= requestedTo) {
        windows.push({ from: suffixStart, to: requestedTo });
      }
    }

    return windows;
  }
  ```

- `previousDateKey` and `nextDateKey` are date-shifting helpers (move one calendar day backward/forward). They're defined elsewhere in the same file.
- `toDateKey` normalizes a date string to `YYYY-MM-DD` format.

The function has no unit tests — only `buildRoiSeriesPayload` (the top-level orchestrator) has 6 integration-level tests in `server/__tests__/performance_history.test.js`.

The fix follows the existing function's pattern: iterate sorted dates, detect gaps > 1 day between consecutive dates, emit a window for each gap.

## Commands you will need

| Purpose            | Command                           | Expected on success |
| ------------------ | --------------------------------- | ------------------- |
| Backend tests      | `npm run test:node`               | all 496 pass        |
| Lint               | `npm run lint`                    | exit 0              |
| Typecheck (server) | `npm run verify:typecheck:server` | exit 0              |

## Scope

**In scope**:

- `server/services/performanceHistory.js` — add mid-range gap detection to `buildPriceFetchWindows`
- `server/__tests__/performance_history.test.js` — add tests for `buildPriceFetchWindows`

**Out of scope**:

- `server/routes/analytics.ts` — the caller of `getLegacyRows`; its repair flow is correct, only the gap detection inside `performanceHistory.js` is wrong
- `server/jobs/daily_close.js` — uses `ensurePriceCoverage` which calls this path, but the job logic itself is correct
- Any changes to the price fetching or caching layers
- Other private functions in `performanceHistory.js`

## Git workflow

- Branch: `advisor/003-mid-range-price-gap-detection`
- Commit style: `fix: detect mid-range price gaps during performance history rebuild`

## Steps

### Step 1: Add mid-range gap detection to buildPriceFetchWindows

In `server/services/performanceHistory.js`, after the prefix/suffix window checks (after line 141, before `return windows;`), add:

```js
// Detect gaps between existing dates (middle segments).
for (let i = 0; i < dates.length - 1; i++) {
  const current = dates[i];
  const next = dates[i + 1];
  const expectedNext = nextDateKey(current);
  if (next !== expectedNext) {
    const gapStart = nextDateKey(current);
    const gapEnd = previousDateKey(next);
    if (gapStart <= gapEnd && gapStart >= requestedFrom && gapEnd <= requestedTo) {
      windows.push({ from: gapStart, to: gapEnd });
    }
  }
}
```

This iterates consecutive date pairs, checks if there is a gap (the next date is not exactly one day after the current one), and emits a window for the gap bounded by the original `requestedFrom`/`requestedTo`.

**Verify**: `node --check server/services/performanceHistory.js` → no syntax errors.

### Step 2: Add unit tests for buildPriceFetchWindows

The file `server/__tests__/performance_history.test.js` has tests for `buildRoiSeriesPayload`. Add a new test block for `buildPriceFetchWindows`. Since it's a private function, either:

**Option A (preferred)**: Export `buildPriceFetchWindows` for testing (add a named export alongside the existing exports at the bottom of the file):

```js
export { buildPriceFetchWindows };
```

Then in `server/__tests__/performance_history.test.js`, add tests following the existing `node:test` pattern:

```js
import { buildPriceFetchWindows } from '../services/performanceHistory.js';

test('buildPriceFetchWindows: returns single window for empty rows', () => {
  const windows = buildPriceFetchWindows([], '2024-01-01', '2024-01-10');
  assert.deepStrictEqual(windows, [{ from: '2024-01-01', to: '2024-01-10' }]);
});

test('buildPriceFetchWindows: returns empty for fully covered range', () => {
  const rows = [
    { date: '2024-01-01' },
    { date: '2024-01-02' },
    { date: '2024-01-03' },
    { date: '2024-01-04' },
    { date: '2024-01-05' },
  ];
  const windows = buildPriceFetchWindows(rows, '2024-01-01', '2024-01-05');
  assert.deepStrictEqual(windows, []);
});

test('buildPriceFetchWindows: detects prefix gap', () => {
  const rows = [{ date: '2024-01-05' }, { date: '2024-01-06' }];
  const windows = buildPriceFetchWindows(rows, '2024-01-01', '2024-01-06');
  assert.deepStrictEqual(windows, [{ from: '2024-01-01', to: '2024-01-04' }]);
});

test('buildPriceFetchWindows: detects suffix gap', () => {
  const rows = [{ date: '2024-01-01' }, { date: '2024-01-02' }];
  const windows = buildPriceFetchWindows(rows, '2024-01-01', '2024-01-06');
  assert.deepStrictEqual(windows, [{ from: '2024-01-03', to: '2024-01-06' }]);
});

test('buildPriceFetchWindows: detects mid-range gap', () => {
  const rows = [
    { date: '2024-01-01' },
    { date: '2024-01-02' },
    // gap: Jan 3–Jan 8
    { date: '2024-01-09' },
    { date: '2024-01-10' },
  ];
  const windows = buildPriceFetchWindows(rows, '2024-01-01', '2024-01-10');
  assert.deepStrictEqual(windows, [{ from: '2024-01-03', to: '2024-01-08' }]);
});

test('buildPriceFetchWindows: detects multiple mid-range gaps', () => {
  const rows = [
    { date: '2024-01-01' },
    // gap 1: Jan 2–3
    { date: '2024-01-04' },
    // gap 2: Jan 5–7
    { date: '2024-01-08' },
  ];
  const windows = buildPriceFetchWindows(rows, '2024-01-01', '2024-01-08');
  assert.deepStrictEqual(windows, [
    { from: '2024-01-02', to: '2024-01-03' },
    { from: '2024-01-05', to: '2024-01-07' },
  ]);
});
```

Test cases to cover:

1. Empty rows → single window for full range
2. Fully covered range → no windows
3. Prefix gap only → one window for the prefix
4. Suffix gap only → one window for the suffix
5. Mid-range gap → one window for the gap (THIS IS THE BUG FIX)
6. Multiple mid-range gaps → multiple windows
7. `from` > `to` → empty array (edge case already handled at line 110)

**Verify**: `npm run test:node` → all tests pass including the new ones.

## Test plan

- New tests in `server/__tests__/performance_history.test.js` covering the 7 cases above.
- Follow the existing test pattern: use `import { test } from 'node:test'` and `import assert from 'node:assert/strict'`.
- **Verification**: `npm run test:node` → all pass, including 7+ new tests for `buildPriceFetchWindows`.

## Done criteria

- [ ] `buildPriceFetchWindows` detects mid-range gaps (test case 5 passes)
- [ ] `npm run test:node` exits 0; new tests for `buildPriceFetchWindows` exist and pass
- [ ] `npm run lint` exits 0
- [ ] `npm run verify:typecheck:server` exits 0
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- The code at the locations in "Current state" doesn't match the excerpts (the codebase has drifted).
- `previousDateKey` or `nextDateKey` are not available in scope — verify they're defined in the same file.
- Adding the export breaks any existing test or build.
- The new tests fail — do not change the tests to match broken behavior; fix the implementation.

## Maintenance notes

- If the price data model changes from daily to intraday, the gap detection logic (one calendar day = one step) will need to be parameterized by the data frequency.
- The `buildPriceFetchWindows` function is called from `ensurePriceCoverage` and `rebuildPersistentSeries`. Both paths benefit from this fix.
- If the function becomes a public export (for testing), consider adding JSDoc to document the contract. The existing functions in this file are sparsely documented.

# Plan 009: Test infrastructure hardening — remove over-broad network skip and replace wall-clock delays

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md` — unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 21ff5b1..HEAD -- server/__tests__/prices.test.js server/__tests__/priceCache.test.js`
> If these files changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `21ff5b1`, 2026-06-16

## Why this matters

Two test infrastructure flaws reduce suite reliability:

1. **`prices.test.js`** skips ALL 17 tests when `NO_NETWORK_TESTS=1` is set, despite every test using a mocked `fetchImpl` (zero real network calls). If this env var is set in a CI or developer environment, all price provider tests silently disappear, allowing regressions to go undetected.

2. **`priceCache.test.js`** uses real `setTimeout` delays (1200ms and 75ms) to test TTL expiration. These are flaky under CPU load/CI and add unnecessary wall-clock time to the test suite. Use fake timers instead.

## Current state

- `server/__tests__/prices.test.js:84-85` — over-broad skip:

  ```js
  const skipNetwork = process.env.NO_NETWORK_TESTS === '1';
  const test = skipNetwork ? baseTest.skip : baseTest;
  ```

  ALL tests in the file use `test(...)` which is now aliased to either `baseTest` or `baseTest.skip`. Every single test case uses a mock `fetchImpl`:

  ```js
  test('YahooPriceProvider parses adjusted close values and logs latency', async () => {
    const fetchImpl = async () => ({ ok: true, json: async () => yahooV8Json });
    // ...
  });
  ```

- `server/__tests__/priceCache.test.js:56-58` — 1200ms wall-clock delay:

  ```js
  await new Promise((resolve) => setTimeout(resolve, 1_200));
  assert.equal(getCachedPrice('GOOG', '1y'), undefined);
  ```

- `server/__tests__/priceCache.test.js:67-69` — 75ms wall-clock delay:
  ```js
  await new Promise((resolve) => setTimeout(resolve, 75));
  assert.equal(getCachedPrice('SPY', 'latest:open', { maxAgeMs: 50 }), undefined);
  ```

## Commands you will need

| Purpose                 | Command                                                                                                          | Expected on success |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------- |
| Full test suite         | `npm test`                                                                                                       | all pass            |
| Backend tests (focused) | `node --enable-source-maps tools/run-tests.mjs --no-coverage -- --test-name-pattern="prices\|priceCache\|price"` | all pass            |

## Scope

**In scope**:

- `server/__tests__/prices.test.js` — remove the over-broad `skipNetwork` guard (lines 84-85)
- `server/__tests__/priceCache.test.js` — replace `setTimeout` delays with fake timers

**Out of scope**:

- Other test files with real timers — only priceCache.test.js is addressed
- The `NO_NETWORK_TESTS` env var itself — it's a legitimate mechanism for other test files that DO hit the network
- The `node:test` fake timer API — Node 24 supports `MockTimers` via `node:test`

## Git workflow

- Branch: `advisor/009-test-infrastructure-hardening`
- Commit style: `test: remove over-broad network skip and use fake timers in price tests`

## Steps

### Step 1: Remove over-broad skipNetwork guard

In `server/__tests__/prices.test.js`, remove lines 84-85:

```js
const skipNetwork = process.env.NO_NETWORK_TESTS === '1';
const test = skipNetwork ? baseTest.skip : baseTest;
```

Replace with:

```js
const test = baseTest;
```

Now all 17 tests run unconditionally, which is safe because they all use mock `fetchImpl`.

**Verify**: `grep "skipNetwork\|NO_NETWORK" server/__tests__/prices.test.js` → no matches.

### Step 2: Replace real timers with fake timers in priceCache.test.js

Node 24's `node:test` supports `mock.timers` for fake timer control. In `server/__tests__/priceCache.test.js`:

**Add imports** (at the top with other imports):

```js
import { mock } from 'node:test';
```

**Test 1: TTL expiration after 1 second**

Replace:

```js
test('honours TTL expiry for cached prices', async () => {
  configurePriceCache({ ttlSeconds: 1, checkPeriodSeconds: 1 });
  flushPriceCache();

  setCachedPrice('GOOG', '1y', [{ date: '2024-01-01', close: 120 }]);
  assert.ok(getCachedPrice('GOOG', '1y'));

  await new Promise((resolve) => setTimeout(resolve, 1_200));

  assert.equal(getCachedPrice('GOOG', '1y'), undefined);
});
```

With:

```js
test('honours TTL expiry for cached prices', async (t) => {
  configurePriceCache({ ttlSeconds: 1, checkPeriodSeconds: 1 });
  flushPriceCache();

  setCachedPrice('GOOG', '1y', [{ date: '2024-01-01', close: 120 }]);
  assert.ok(getCachedPrice('GOOG', '1y'));

  // Advance time past the 1-second TTL plus check period.
  t.mock.timers.tick(1_500);

  assert.equal(getCachedPrice('GOOG', '1y'), undefined);
});
```

**Test 2: maxAge guard for live cache reads**

Replace the 75ms setTimeout with:

```js
test('honours maxAge guards for live cache reads', async (t) => {
  setCachedPrice('SPY', 'latest:open', [{ date: '2024-01-01', close: 120 }], {
    ttlSeconds: 60,
  });
  assert.ok(getCachedPrice('SPY', 'latest:open', { maxAgeMs: 50 }));

  // Advance time past the 50ms maxAge.
  t.mock.timers.tick(60);

  assert.equal(getCachedPrice('SPY', 'latest:open', { maxAgeMs: 50 }), undefined);
});
```

**Important**: Check if `node-cache` uses its own internal timer mechanism. If it relies on `setInterval` for TTL checking, `mock.timers.tick()` will advance those too. If `node-cache` uses `Date.now()` internally instead of `setTimeout`/`setInterval`, the mock timers approach may not work — in that case, STOP and use the alternative approach below.

**Alternative if fake timers don't work with node-cache**: Reduce the TTL values to sub-second and use proportionally shorter real timeouts, or test the cache directly without the TTL check period by calling its internal `_checkData()` method if exposed.

**Verify**: `node --enable-source-maps tools/run-tests.mjs --no-coverage -- --test-name-pattern="priceCache"` → tests pass, and they complete in <1 second (instead of ~2 seconds).

### Step 3: Run full test suite

**Verify**: `npm test` → all tests pass. Pay special attention to the price and cache tests:

- `npm run test:node` → 496 pass (the prices.test.js should now show 17 tests even with NO_NETWORK_TESTS=1)
- `npx vitest run` → 128 pass

## Test plan

No new tests needed — we're fixing the test infrastructure, not the application.

- **Verification**: `NO_NETWORK_TESTS=1 npm run test:node` → the price tests STILL RUN (not skipped).

## Done criteria

- [ ] `grep "skipNetwork" server/__tests__/prices.test.js` returns no matches
- [ ] `NO_NETWORK_TESTS=1 npm run test:node -- --test-name-pattern="prices"` → price tests RUN (not skipped), all pass
- [ ] `npm run test:node -- --test-name-pattern="priceCache"` → cache tests pass in under 1 second (down from ~2.5s)
- [ ] `npm test` exits 0; all tests pass
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- The `mock.timers.tick()` approach doesn't work with `node-cache` — `node-cache` may use `Date.now()` internally, which `mock.timers` doesn't affect. If so, use the alternative approach (reduce TTL to sub-millisecond values and use shorter real delays, or refactor the cache to accept a `now` function for testability).
- Removing `skipNetwork` causes any test to fail — unlikely, but check whether any test actually hits the network unexpectedly.
- Any other test file previously relying on `skipNetwork` behavior breaks — this change only affects `prices.test.js`.

## Maintenance notes

- The `NO_NETWORK_TESTS` env var is still used by other test files that legitimately hit the network. Do NOT remove the env var mechanism globally — only remove it from files where all tests use mocks.
- If `node-cache` is ever replaced with a different caching library, the fake timer pattern may need to be revisited. The test should validate TTL behavior, not the internal timer mechanism.
- Node 24's `mock.timers` is stable and is the recommended way to test time-dependent code. Prefer it over `sinon` or manual `setTimeout` mocking.

# Todo — Price Fetch Fix

## Phase 0 — Spec & Scaffold

- [x] Write `spec.md` with problem statement, goals, implementation details, invariants, verification table
- [x] Overwrite `todo.md` with this checklist
- [ ] Create `tests/prices/` directory and three test files
- [ ] Add `tests/prices` to `TEST_DIRS` in `tools/run-tests.mjs`

## Phase 1 — Config

- [ ] `.env`: change `PRICE_PROVIDER_FALLBACK=none` → `PRICE_PROVIDER_FALLBACK=yahoo`
- [ ] `.env.example`: same change

## Phase 2 — Stooq hardening

- [ ] `StooqPriceProvider`: add `User-Agent` header to `fetch` options
- [ ] `StooqPriceProvider`: detect HTML response via `Content-Type` header
- [ ] `StooqPriceProvider`: detect HTML response via body first-line check (`starts with <`)
- [ ] Verify: existing Stooq tests in `server/__tests__/prices.test.js` still pass

## Phase 3 — Yahoo Finance crumb auth

- [ ] `YahooPriceProvider`: add `_crumbCache` and `_crumbTtlMs` instance fields
- [ ] `YahooPriceProvider`: implement `_refreshCrumb()` method
  - [ ] GET `https://finance.yahoo.com` → capture `Set-Cookie` headers
  - [ ] GET `https://query1.finance.yahoo.com/v1/test/getcrumb` → plain-text crumb
  - [ ] Validate crumb length ≥ 4
  - [ ] Store `{ crumb, cookies, fetchedAt }` on instance
- [ ] `YahooPriceProvider.getDailyAdjustedClose()`: lazy crumb fetch before chart request
- [ ] `YahooPriceProvider.getDailyAdjustedClose()`: append `crumb` param + `Cookie` header
- [ ] `YahooPriceProvider.getDailyAdjustedClose()`: on 401/403 → invalidate + refresh + retry once
- [ ] Verify: existing Yahoo tests in `server/__tests__/prices.test.js` still pass

## Phase 4 — Tests

- [ ] `tests/prices/stooq-provider.test.js` — all 6 cases (see spec.md)
- [ ] `tests/prices/yahoo-crumb.test.js` — all 6 cases (see spec.md)
- [ ] `tests/prices/dual-provider-fallback.test.js` — all 4 cases (see spec.md)
- [ ] `tests/e2e/prices-smoke.spec.ts` — Playwright smoke for prices

## Phase 5 — Verification

- [ ] `npm run test:node` — all node:test suites green (including new tests/prices/)
- [ ] `npm test` (vitest) — no regressions in src/**tests**
- [ ] Manual: `GET /api/prices/bulk?symbols=SPY&latest=1` returns non-empty series
- [ ] Manual: Server log shows `price_provider_fallback` when Stooq mocked to fail

## Phase 6 — Review

- [ ] Sub-agent: "review spec.md and current implementation for gaps" → loop on feedback

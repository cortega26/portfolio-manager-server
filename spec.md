# Price Fetch Fix — Spec

## Problem Statement

The app is not displaying live, extended-hours, or last-close prices for any holding.
NAV, per-share prices, and allocation charts all show stale or missing data.

Root-cause audit (April 2026) identified three compounding defects:

| #   | Defect                                                   | Location                                     | Impact                                                                                                               |
| --- | -------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| D1  | `PRICE_PROVIDER_FALLBACK=none` in `.env`                 | `.env`, `.env.example`                       | No fallback when Stooq fails; any Stooq outage → total price blackout                                                |
| D2  | Stooq requests have no `User-Agent` header               | `server/data/prices.js` `StooqPriceProvider` | Stooq CDN rate-limits or blocks naked requests; returns HTML captcha/redirect which the CSV parser silently fails on |
| D3  | Yahoo Finance v8 chart endpoint requires a session crumb | `server/data/prices.js` `YahooPriceProvider` | All Yahoo requests return 401/403 without a valid `crumb` query param and matching `Cookie` header                   |

---

## Goals

### G1 — Restore end-of-day prices (eod_fresh)

`GET /api/prices/bulk?symbols=SPY&latest=1` must return a non-empty `series` object with `status = eod_fresh` or `live` for at least one equity symbol during and after market hours.

### G2 — Fallback chain works

When Stooq is unavailable (network error, rate-limit, HTML response), Yahoo Finance is tried automatically. The server log must contain `price_provider_fallback` for that request.

### G3 — Yahoo Finance crumb auth

`YahooPriceProvider.getDailyAdjustedClose` must obtain a session crumb from `https://query1.finance.yahoo.com/v1/test/getcrumb` before each batch of chart requests, cache the crumb for 30 minutes, and automatically refresh it on a 401/403 response with exactly one retry.

### G4 — Stooq requests succeed

`StooqPriceProvider` must send a `User-Agent` header on every request and must detect and reject HTML responses (captcha/redirect) with a `PRICE_FETCH_FAILED` error code instead of trying to parse garbage CSV.

### G5 — All existing tests remain green

No regression in the existing `npm test` suite.

---

## Implementation Details

### I1 — Config: re-enable Yahoo fallback

Files: `.env`, `.env.example`

```
PRICE_PROVIDER_FALLBACK=yahoo   # was: none
```

### I2 — Stooq hardening

File: `server/data/prices.js` → `StooqPriceProvider.getDailyAdjustedClose`

Changes:

1. Pass `headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0' }` in the `fetch` call options.
2. After receiving the response, check:
   - `response.headers.get('content-type')` contains `text/html`
   - OR the first non-empty line of `csv` starts with `<`

   If either is true: throw `Error('Stooq returned HTML instead of CSV for <symbol>')` with `error.code = 'PRICE_FETCH_FAILED'`.

### I3 — Yahoo Finance crumb auth

File: `server/data/prices.js` → `YahooPriceProvider`

**Instance state added:**

```js
this._crumbCache = null; // { crumb: string, cookies: string, fetchedAt: number }
this._crumbTtlMs = 30 * 60 * 1000; // 30 minutes
```

**New private method `_refreshCrumb()`:**

```
1. GET https://finance.yahoo.com  (browser UA headers)
   → capture Set-Cookie response headers → build cookie string
2. GET https://query1.finance.yahoo.com/v1/test/getcrumb
   (same UA + Cookie header with captured cookies)
   → plain-text body is the crumb
3. Validate: crumb must be a non-empty string ≥ 4 chars
4. Store: this._crumbCache = { crumb, cookies, fetchedAt: Date.now() }
```

**Modified `getDailyAdjustedClose()`:**

```
Before building the chart URL:
  if (!this._crumbCache || Date.now() - this._crumbCache.fetchedAt > this._crumbTtlMs)
    await this._refreshCrumb()

Append to chart URL:  url.searchParams.set('crumb', this._crumbCache.crumb)
Add to fetch options: headers: { ..., Cookie: this._crumbCache.cookies }

On 401 or 403 response:
  this._crumbCache = null   // invalidate
  await this._refreshCrumb()  // refresh
  rebuild URL with new crumb + new cookies
  retry the chart fetch once
  if retry also fails: throw the error
```

**Multi-value Set-Cookie handling (node-fetch v3.3+):**

```js
const setCookies =
  typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : [res.headers.get('set-cookie') ?? ''].filter(Boolean);
const cookies = setCookies
  .map((h) => h.split(';')[0].trim())
  .filter(Boolean)
  .join('; ');
```

### I4 — Test scaffold: add `tests/prices/` to the test runner

File: `tools/run-tests.mjs`

Add `'tests/prices'` to `TEST_DIRS` array so `npm run test:node` discovers new tests automatically.

---

## New Tests

### `tests/prices/stooq-provider.test.js` (node:test)

| Test                                                        | Assertion                              |
| ----------------------------------------------------------- | -------------------------------------- |
| Sends `User-Agent` header                                   | `options.headers['User-Agent']` is set |
| Parses multi-row CSV correctly                              | Returns sorted `{date, adjClose}[]`    |
| Throws `PRICE_NOT_FOUND` on "No data" CSV                   | `error.code === 'PRICE_NOT_FOUND'`     |
| Throws `PRICE_FETCH_FAILED` on HTML response (content-type) | `error.code === 'PRICE_FETCH_FAILED'`  |
| Throws `PRICE_FETCH_FAILED` on HTML body (starts with `<`)  | `error.code === 'PRICE_FETCH_FAILED'`  |
| Skips rows outside the requested date window                | Result has only in-range rows          |

### `tests/prices/yahoo-crumb.test.js` (node:test)

| Test                                               | Assertion                                           |
| -------------------------------------------------- | --------------------------------------------------- |
| Fetches crumb before first chart request           | crumb appended to chart URL                         |
| Crumb is reused within TTL                         | crumb endpoint hit exactly once for two chart calls |
| `Cookie` header forwarded to chart request         | `Cookie` header present in chart fetch              |
| On 401: invalidates crumb, refreshes, retries once | Chart fetch called twice; second succeeds           |
| On 403: same retry behaviour as 401                | Chart fetch called twice; second succeeds           |
| Crumb refresh failure propagates cleanly           | Throws, does not hang                               |

### `tests/prices/dual-provider-fallback.test.js` (node:test)

| Test                                                | Assertion                                       |
| --------------------------------------------------- | ----------------------------------------------- |
| Primary success: fallback never called              | `fallback.calls === 0`                          |
| Primary HTML error triggers fallback                | `fallback.calls === 1`; result is fallback data |
| Both providers fail: throws last error              | Throws `lastError`                              |
| Health-monitor-marked unhealthy provider is skipped | Unhealthy provider is not attempted             |

### `tests/e2e/prices-smoke.spec.ts` (Playwright)

| Test                                                 | Assertion                                    |
| ---------------------------------------------------- | -------------------------------------------- |
| App loads and shows a price for SPY                  | PricesTab row for SPY contains a number > 0  |
| Manual refresh returns at least one non-error status | Status badge is not `error` or `unavailable` |

---

## Verification Table

| Goal                        | Automated check                                         | Manual check                                                         |
| --------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------- |
| G1 — eod_fresh prices       | `tests/prices/stooq-provider.test.js` passes            | `GET /api/prices/bulk?symbols=SPY&latest=1` returns non-empty series |
| G2 — Fallback chain         | `tests/prices/dual-provider-fallback.test.js` passes    | Server log shows `price_provider_fallback` when Stooq mocked to fail |
| G3 — Yahoo crumb            | `tests/prices/yahoo-crumb.test.js` passes               | `YahooPriceProvider` returns rows without 401 in fresh environment   |
| G4 — Stooq UA + HTML reject | `tests/prices/stooq-provider.test.js` (UA + HTML tests) | Stooq response is CSV, not HTML                                      |
| G5 — No regression          | `npm test` all green                                    | —                                                                    |

---

## Invariants (must not be broken)

- `PRICE_PROVIDER_FALLBACK=none` must never appear in `.env` or `.env.example` after this fix.
- `StooqPriceProvider` must always send a `User-Agent` header.
- `YahooPriceProvider` must never call the crumb endpoint more than once per 30 minutes per instance, and must retry on 401/403 exactly once.
- Crumb cache lives on the instance, not at module level.
- No new npm dependencies are introduced.

## Confirmed Context

- The app is desktop-first: Electron handles secure session tokens for the `desktop` portfolio.
- During standalone development without Electron (`npm run dev` and `npm run server`), the API lacks an injected session token.
- The `sessionAuth` middleware strictly applies a 500 error when no token is present, even in development mode.
- This causes the renderer to fail the portfolio load with the message "Desktop session credentials are missing", resulting in an empty dashboard (no transactions, no NAV).
- The underlying SQLite database correctly contains all transactions for the portfolio, and data processing (`holdingsLedger`) executes cleanly in under ~20ms.

## Root Cause

The `sessionAuth.js` middleware enforces the presence of a `PORTFOLIO_SESSION_TOKEN` universally. When running independently of Electron, the token is undefined. The backend responds with `500 SESSION_AUTH_MISCONFIGURED` to all `/api/portfolio/desktop` reads. The frontend catches this, displays a toast, and aborts the data load.

## Goals

### G1. Allow App Development Execution

The standalone development server (`NODE_ENV === 'development'`) must bypass the `sessionAuth` requirement if no token is injected.

### G2. Fix Frontend Data Loading

Resolving the 500 error will allow the frontend to successfully retrieve and process the portfolio transactions in the standalone browser experience.

### G3. Ensure Security in Production

The backend must continue to enforce session token constraints identically outside of development environments.

## Implementation Plan

### I1. Middleware Bypass for Development

Modify `server/middleware/sessionAuth.js` so that if no `sessionToken` is configured AND `process.env.NODE_ENV === "development"`, it sets `req.portfolioAuth = { mode: "development_bypass" }` and proceeds via `next()` rather than generating an error.

### I2. Explicit Environment Token Configuration

Update `.env` and `.env.example` to document `PORTFOLIO_SESSION_TOKEN=dev-secret-token` as a manual override, ensuring developers are aware of how development bypass functions.

## Verification

### V1. Standalone Dev Flow

- `npm run dev` and `npm run server` successfully load the `desktop` portfolio data without 500 errors.

### V2. Electron Flow (Preserved)

- The Electron App continues its normal unlock behavior dynamically injecting runtime session configurations.
- `npm run test:e2e` and `npm test` remain green.

## Non-Goals

- Changing the frontend UI components handling the data processing.
- Changing the SQLite retrieval mechanisms.

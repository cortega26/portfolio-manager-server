# Plan 011: Trust layer backend metadata for prices and analytics

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md` — unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 21ff5b1..HEAD -- shared/trust.ts server/routes/ server/data/prices.js`
> If these files changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `21ff5b1`, 2026-06-16

## Why this matters

The frontend already has trust-badge UI components (`TrustBadge.jsx`, `TrustTooltip.jsx`) and a `shared/trust.ts` module that computes trust levels from price metadata. However, the backend API responses for prices, analytics, and benchmarks don't include the `source_type`, `freshness_state`, `confidence_state`, and `degraded_reason` fields that these components expect. The trust badges on the dashboard are currently fed with minimal/inferred data. Adding trust metadata to backend responses makes every price and metric explainable to the user — the core product goal of the trust layer. This is also a prerequisite for the review-first shell (plan 012), which uses trust metadata to prioritize what needs attention.

This is a **design/spike plan**: it defines what to build and the API contract, but the exact implementation details (where to inject metadata in each route) require exploration during execution.

## Current state

- `shared/trust.ts` — exports `buildTrustFromPriceStatus`, `isTrustHigh`, and `PRICE_STATUS_TO_TRUST`. Already maps price statuses to trust levels but expects explicit `source_type`, `freshness_state` fields.

- `src/components/shared/TrustBadge.jsx` — renders a colored badge with confidence level. Expects props like `sourceType`, `freshness`, `confidence`.

- `src/components/shared/TrustTooltip.jsx` — renders a tooltip explaining WHY a metric has its trust level. Expects `degradedReason`, `sourceType`, `lastUpdated`.

- `server/data/prices.js` — price provider responses include raw data (price, date) but no trust metadata. The `DualPriceProvider` already knows which provider succeeded and which failed — this is the natural place to generate trust metadata.

- `server/routes/portfolio.ts` — portfolio endpoints return holdings, transactions, etc. with no trust metadata.

- `server/routes/analytics.ts` — analytics endpoints return ROI, NAV, benchmarks with no trust metadata.

## Commands you will need

| Purpose          | Command                                                       | Expected on success |
| ---------------- | ------------------------------------------------------------- | ------------------- |
| Full test suite  | `npm test`                                                    | all pass            |
| Lint             | `npm run lint`                                                | exit 0              |
| Typecheck (both) | `npm run verify:typecheck && npm run verify:typecheck:server` | exit 0              |

## Scope

**In scope**:

- `shared/trust.ts` — define the `TrustMetadata` type/interface
- `server/data/prices.js` — enrich price responses with trust metadata
- `server/routes/` — add trust metadata to relevant API responses (prices, benchmarks, analytics)
- Tests for the trust metadata injection

**Out of scope**:

- Frontend trust components — they already exist and expect this data; no changes needed
- Changing the TrustBadge/TrustTooltip to consume the new fields — they should already work if the field names match
- Historical price data backfill — only new/live price responses need metadata

## Git workflow

- Branch: `advisor/011-trust-layer-backend-metadata`
- Commit style: `feat: add trust metadata to price and analytics API responses`

## Steps

### Step 1: Define the TrustMetadata schema

In `shared/trust.ts`, define a canonical `TrustMetadata` type that both backend and frontend can reference:

```ts
export interface TrustMetadata {
  /** Where the data came from */
  source_type: 'live_provider' | 'cache' | 'fallback_provider' | 'estimated' | 'manual' | 'unknown';
  /** How fresh the data is */
  freshness_state: 'fresh' | 'stale' | 'expired' | 'unknown';
  /** Overall confidence in the value */
  confidence_state: 'high' | 'medium' | 'low' | 'degraded';
  /** Human-readable reason for degraded confidence (empty string if high confidence) */
  degraded_reason: string;
  /** ISO 8601 timestamp of when the data was fetched or computed */
  fetched_at: string | null;
  /** Which provider served the data (e.g., 'yahoo', 'stooq', 'alpaca', 'cache') */
  provider: string | null;
}
```

### Step 2: Inject trust metadata into price provider responses

In `server/data/prices.js`, each price provider (`YahooPriceProvider`, `StooqPriceProvider`, `DualPriceProvider`) already knows which provider served the data and whether a fallback was used. After price data is fetched, compute `TrustMetadata` based on:

- `source_type`: `'live_provider'` if fetched fresh, `'cache'` if from node-cache, `'fallback_provider'` if the primary failed and fallback succeeded
- `freshness_state`: `'fresh'` if fetched within the live TTL, `'stale'` if within the closed TTL, `'expired'` if past all TTLs
- `confidence_state`: `'high'` if live fresh, `'medium'` if cached but within TTL, `'low'` if expired, `'degraded'` if all providers failed
- `degraded_reason`: populated when confidence is `'low'` or `'degraded'`
- `fetched_at`: the timestamp when the price was fetched
- `provider`: the provider name string

The `DualPriceProvider` already has a `getDailyAdjustedClose` method that orchestrates primary → fallback. This is the best injection point — after the fetch, before returning, attach the metadata to each price row or as a separate `_meta` field.

### Step 3: Add trust metadata to price API responses

In `GET /api/prices/:symbol` and `GET /api/prices/bulk` (handled in `server/routes/`), include trust metadata in the response. The response shape should add an optional `trust` field:

```json
{
  "symbol": "AAPL",
  "prices": [...],
  "trust": {
    "source_type": "live_provider",
    "freshness_state": "fresh",
    "confidence_state": "high",
    "degraded_reason": "",
    "fetched_at": "2026-06-16T14:30:00Z",
    "provider": "yahoo"
  }
}
```

### Step 4: Add trust metadata to benchmark and analytics responses

For `GET /api/benchmarks/summary`, add trust metadata to each benchmark's data. For `GET /api/returns/daily` and `GET /api/nav/daily`, add trust metadata describing the source of the computation (always `'computed'` source_type with confidence based on whether prices were live or cached).

### Step 5: Add tests

Add tests to verify:

- Price responses include trust metadata with the expected fields
- The `source_type` correctly reflects the fetch path (live vs cache vs fallback)
- `degraded_reason` is populated when confidence is low
- The existing API contract tests still pass (metadata is additive, not breaking)

**Test file**: `server/__tests__/trust_metadata.test.js` following the pattern in `api_contract.test.js`.

## Test plan

- New tests in `server/__tests__/trust_metadata.test.js`:
  - Price endpoint returns trust metadata
  - Bulk price endpoint returns trust metadata per symbol
  - Benchmark summary includes trust metadata
  - Trust metadata has all required fields
  - Degraded reason is populated when all providers fail
- Existing tests must continue to pass — metadata is additive.
- **Verification**: `npm run test:node` → all tests pass, including new trust metadata tests.

## Done criteria

- [ ] `TrustMetadata` type is defined in `shared/trust.ts`
- [ ] Price responses include a `trust` field with all 6 sub-fields populated
- [ ] Analytics/benchmark responses include trust metadata
- [ ] New tests cover the trust metadata contract
- [ ] `npm test` exits 0; all tests pass
- [ ] `npm run lint` exits 0
- [ ] `npm run verify:typecheck && npm run verify:typecheck:server` exits 0
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- The existing API response shape is tightly coupled to frontend consumers and adding a `trust` field breaks any existing test. The field should be additive — old consumers ignore unknown fields. If a Zod schema rejects extra fields, update the schema to `.passthrough()` or add `trust` as an optional field.
- The `DualPriceProvider` architecture makes it difficult to capture which provider succeeded. If so, inject metadata at the `createPriceProvider` factory level instead.
- The price cache (`node-cache`) doesn't store metadata alongside cached prices. If the cache only stores raw price arrays, extend the cache value shape to include metadata, or compute metadata at read time.

## Maintenance notes

- Trust metadata is computed at fetch time. If a price is served from cache, the metadata should reflect the ORIGINAL fetch's trust, not the current time. Store metadata inside the cache entry alongside the price data.
- When adding a new price provider, update the `provider` enum in the trust metadata and ensure the provider name is set correctly.
- The frontend `TrustBadge` and `TrustTooltip` components in `src/components/shared/` are the consumers. After this plan lands, verify they render correctly with the new metadata — if field names don't match, update either the backend or frontend (but not both in this plan).

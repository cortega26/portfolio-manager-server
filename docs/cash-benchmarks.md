# Cash & Benchmarks

This document describes the daily cash accrual, NAV, return, and benchmark infrastructure introduced by the `features.cash_benchmarks` flag. All functionality is persisted in JSON-backed tables under the configured `DATA_DIR`.

## Data Model

| Table | Purpose |
| --- | --- |
| `transactions.json` | Portfolio ledger including automated `INTEREST` entries. |
| `cash_rates.json` | Piecewise-constant APY timeline used for daily interest. |
| `prices.json` | Daily adjusted close prices for held tickers, SPY, and cash (fixed 1.0). |
| `nav_snapshots.json` | End-of-day NAV, ex-cash NAV, sleeve balances, and `stale_price` flag. |
| `returns_daily.json` | Time-weighted daily returns for portfolio, ex-cash sleeve, blended benchmark, SPY, and cash. |
| `_migrations_state.json` | Migration bookkeeping to keep file schema idempotent. |

## Cash Accrual

Daily interest is posted as an `INTEREST` transaction using:

\[
 r_{\text{daily}} = (1 + \text{APY})^{1/365} - 1, \quad \text{Interest}_t = \text{Cash}_{t-1} \cdot r_{\text{daily}}
\]

The accrual job writes deterministic identifiers (`interest-YYYY-MM-DD`) so re-running the job simply updates the same record.

## Time-Weighted Returns & Benchmarks

For each day `t` we compute external flows `F_t` (deposits/withdrawals) and apply standard TWR:

\[
 r_t = \frac{MV_t - F_t}{MV_{t-1}} - 1
\]

Additional series:

- **Ex-Cash Sleeve** uses risk asset NAV only (flows treated as internal).
- **Cash Return** is the per-day cash rate above.
- **All-SPY Track** reinvests flows into SPY using adjusted close and yields the same TWR as a 100% SPY account with those flows.
- **Blended Benchmark** weights SPY vs. cash by the **start-of-day** allocation `w_{cash,t}` taken from the prior day's NAV snapshot.

Cumulative summaries report total return as \( \prod_t (1+r_t) - 1 \) and cash drag metrics:

- `vs_self = R_{ex\_cash} - R_{port}`
- `allocation = R_{spy\_100} - R_{bench\_blended}`

## Nightly Job & Backfill

`server/jobs/daily_close.js` executes the following steps for the target day (defaults to the last completed UTC day):

1. Resolve effective APY for the prior day and accrue cash interest.
2. Fetch adjusted-close prices for SPY and held tickers via the provider interface (default: Yahoo Finance) and persist them, logging provider latency.
3. Rebuild NAV snapshots with carry-forward pricing.
4. Compute and store daily return rows.
5. Update job metadata for idempotent re-runs.

`scheduleNightlyClose` in `server/jobs/scheduler.js` runs the close routine once per day at the configured UTC hour (`JOB_NIGHTLY_HOUR`).
It now consults the trading calendar helper so weekends and hard-coded US market holidays (New Year’s, MLK Day, Presidents’ Day,
Good Friday, Memorial Day, Juneteenth, Independence Day, Labor Day, Thanksgiving, and Christmas) are skipped gracefully. When the
target day is closed, the scheduler logs the skip and re-checks on the next UTC day without failing the job loop.

The CLI `npm run backfill -- --from=YYYY-MM-DD --to=YYYY-MM-DD` replays the same pipeline across historical ranges and is safe to re-run.

## Trading Calendar Helper

`server/utils/calendar.js` centralizes trading-day logic. `isTradingDay(date)` returns `false` for weekends and for the observed
set of US market holidays listed above (including Monday observations when the holiday lands on a weekend) and `true` otherwise.
`computeTradingDayAge` powers the stale-data guard by counting only trading days between two dates, while `nextTradingDay` skips
over consecutive closures. The helper currently ships with a static holiday list; no additional configuration is required.

## API Additions

The feature flag exposes new JSON endpoints:

- `GET /api/returns/daily?from=YYYY-MM-DD&to=YYYY-MM-DD&views=port,excash,spy,bench&page=1&per_page=100`
- `GET /api/nav/daily?from=YYYY-MM-DD&to=YYYY-MM-DD&page=1&per_page=100`
- `GET /api/benchmarks/summary?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `POST /api/admin/cash-rate { effective_date, apy }`

`page`/`per_page` query parameters are optional (defaults: `1` and `100`) and paginate the time-series data. Responses for list endpoints include a `meta` block (`page`, `per_page`, `total`, `total_pages`) plus `ETag` headers so clients can issue conditional requests. Validation errors are surfaced as HTTP `400` with `{ error: "VALIDATION_ERROR", details: [...] }`.

See [`docs/openapi.yaml`](./openapi.yaml) for schemas and examples.

## Data Freshness Guard

Price- and benchmark-derived responses enforce a trading-day-aware freshness threshold. The server inspects the latest available adjusted-close date for each payload and compares it to the configured maximum trading-day age. If the dataset is older than the threshold, the endpoint emits structured warnings and responds with HTTP `503`/`{ "error": "STALE_DATA" }` instead of returning stale analytics. Weekends and major U.S. market holidays are excluded from the age calculation so expected gaps (e.g., long weekends) do not trigger false positives.

## Configuration

| Name | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| `DATA_DIR` | string | `./data` | No | Root directory for JSON tables. |
| `PRICE_FETCH_TIMEOUT_MS` | number | `5000` | No | Timeout for legacy price fetches. |
| `FEATURES_CASH_BENCHMARKS` | boolean | `true` | No | Enables cash & benchmark endpoints/jobs. |
| `JOB_NIGHTLY_HOUR` | number | `4` | No | UTC hour for the nightly accrual job. |
| `CORS_ALLOWED_ORIGINS` | string (CSV) | _(empty)_ | No | Whitelist of origins allowed by the API CORS policy. |
| `FRESHNESS_MAX_STALE_TRADING_DAYS` | number | `3` | No | Maximum allowable trading-day age before `/api/prices/:symbol` and `/api/benchmarks/summary` emit `503 STALE_DATA`. |

## Testing

- Unit coverage: cash accrual, return math, and SPY track parity (`server/__tests__/cash.test.js`, `server/__tests__/returns.test.js`).
- Integration coverage: nightly job idempotency and API exposure (`server/__tests__/daily_close.test.js`).

## TODO

- None.

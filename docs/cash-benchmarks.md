
# Cash & Benchmarks

This document specifies the daily cash accrual, NAV, return, and benchmark infrastructure introduced by the **cash & benchmarks** feature flag (env: `FEATURES_CASH_BENCHMARKS`). All functionality is persisted in JSON-backed tables under the configured `DATA_DIR`.

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

$$
\begin{aligned}
r_{\text{daily}} &= (1+\text{APY})^{1/365} - 1,\\
\text{Interest}_t &= \text{Cash}_{t-1}\cdot r_{\text{daily}}
\end{aligned}
$$

The accrual job writes deterministic identifiers (`interest-YYYY-MM-DD`) so re-running the job simply updates the same record.

### Day-count convention

- Cash interest uses **ACT/365 (Fixed)**. The helper `dailyRateFromApy` converts the stored APY into a daily factor with `(1 + apy)^(1/365) - 1` and rounds booked entries to the nearest cent (`toCents`/`fromCents`). **Note:** under ACT/365(Fixed) we continue to use `365` even in leap years. If ACT/ACT is ever desired, the exponent would need to switch to `1/DaysInYear(t)`.
- The prior day’s closing cash balance (after all trades, deposits, withdrawals, dividends, and previous interest) is the base for interest. A zero or negative cash balance short-circuits the insert so the ledger never accrues spurious income.
- **Input expectation:** `cash_rates.json` stores **APY (effective annual yield)**. If you only have **APR (nominal)**, convert externally or implement a helper (`aprToApy`) instead of storing APR here.

### Rate change proration

- Rates live in `cash_rates.json` as `{ effective_date, apy }` tuples. The resolver sorts entries lexicographically and picks the **latest effective date ≤ target day**. Each calendar day therefore receives the APY that was in force for that day’s close.
- Because the nightly job accrues one day at a time, any APY change mid-month is naturally prorated: days before the change reuse the old APY, and days after the change use the new APY with no interpolation gaps.
- Future-dated entries remain inert until their `effective_date` passes, so uploading a schedule does not back-date interest.

### Effective-date semantics

- When running the nightly accrual for day `D`, the engine first looks at the previous calendar day `D-1`. The APY effective on `D-1` powers the interest posted on `D`, mirroring how banks pay interest for the balance that existed over the prior day.
- A newly inserted APY with `effective_date = 2024-02-01` therefore takes effect on the **close of 2024-02-01** and the interest entry dated `2024-02-02` is the first to reflect it. Historical entries remain unchanged unless a backfill is rerun.
- Re-running either the nightly job or a backfill is idempotent because the transaction ID includes the posting date; repeats simply overwrite the existing `INTEREST` row instead of duplicating it.

## Time-Weighted Returns & Benchmarks

For each day `t` we compute **external flows** `F_t` (deposits/withdrawals only; **internal** events like `BUY`, `SELL`, `DIVIDEND`, `INTEREST`, `FEE` are *excluded*) and apply a daily subperiod return consistent with **end-of-day flow timing**:

$$
r_t = \frac{MV_t - F_t}{MV_{t-1}} - 1
$$

- Interpretation: `F_t` is the **net flow during `[t-1, t]` treated as occurring at the end of day `t`**. This makes intraday flows neutral to that day’s performance (they affect the level, not the return). If you need **start-of-day** timing, the equivalent would be \( r_t = \frac{MV_t}{MV_{t-1} + F_t} - 1 \). If multiple intraday flows must be time-weighted, prefer **Modified Dietz** or break the period at each flow.

Additional series:

- **Ex-Cash Sleeve** uses risk asset NAV only (flows between cash and ex-cash are treated as internal).
- **Cash Return** is the per-day cash rate above.
- **All‑SPY Track** reinvests flows into SPY using adjusted close and yields the same TWR as a 100% SPY account with those flows.
- **Blended Benchmark** weights SPY vs. cash by the **start-of-day** allocation `w_{cash,t}` taken from the prior day's NAV snapshot.

Cumulative summaries report total return as \( \prod_t (1+r_t) - 1 \) and cash‑drag/allocation metrics:

- `vs_self = R_{ex_cash} - R_{port}`
- `allocation = R_{spy_100} - R_{bench_blended}`

### Day-one handling

The first record in `returns_daily` seeds its return using the inception capital from the earliest external flow. When the ledger starts with a `DEPOSIT`, `computeRollingReturns` falls back to the `computeInceptionReturns` helper so day‑one performance reports `(NAV - flow) / flow` instead of zero. Internal transactions (`BUY`/`SELL`/`DIVIDEND`/`INTEREST`/`FEE`) never trigger this bootstrap path, keeping cash‑only days flat.

### Benchmark weight freeze policy

Blended benchmarks reuse the prior day’s NAV snapshot as their weight source. The helper `resolveWeightSource` feeds the **start‑of‑day** cash weight into `computeBenchmarkReturn`, so intraday flows do not retroactively change the mix. If a new deposit arrives mid‑day, the benchmark tracks it as part of the next close rather than rebalancing historical weights.

### Money-weighted returns (XIRR)

`GET /api/benchmarks/summary` returns a `money_weighted` object alongside the TWR summary. The server derives daily cash flows from `DEPOSIT` and `WITHDRAWAL` transactions, prepends the starting NAV as a cash outflow, appends the ending NAV as a cash inflow, and solves for the annualised XIRR via a bisected NPV root finder. The payload exposes:

- `portfolio` – annualised money‑weighted return for the requested range.
- `start_date` / `end_date` – inclusive window the XIRR was solved against.
- `method` – currently always `xirr`, signalling the calculation strategy.

When NAV snapshots are missing for the requested range, the XIRR falls back to `0.0` so consumers can detect incomplete data without guessing.

## Nightly Job & Backfill

`server/jobs/daily_close.js` executes the following steps for the target day (defaults to the last completed **UTC** day):

1. Resolve effective APY for the prior day and accrue cash interest.
2. Fetch adjusted‑close prices for SPY and held tickers via the provider interface (default: Yahoo Finance) and persist them, logging provider latency.
3. Rebuild NAV snapshots with carry‑forward pricing.
4. Compute and store daily return rows.
5. Update job metadata for idempotent re‑runs.

`scheduleNightlyClose` in `server/jobs/scheduler.js` runs the close routine once per day at the configured UTC hour (`JOB_NIGHTLY_HOUR`). It consults the trading‑calendar helper so weekends and hard‑coded US market holidays (New Year’s, MLK Day, Presidents’ Day, Good Friday, Memorial Day, Juneteenth, Independence Day, Labor Day, Thanksgiving, and Christmas) are skipped gracefully. When the target day is closed, the scheduler logs the skip and re‑checks on the next UTC day without failing the job loop.

The CLI

```bash
npm run backfill -- --from=YYYY-MM-DD --to=YYYY-MM-DD
```

replays the same pipeline across historical ranges and is safe to re‑run.

## Trading Calendar Helper

`server/utils/calendar.js` centralizes trading‑day logic. `isTradingDay(date)` returns `false` for weekends and for the observed set of US market holidays listed above (including Monday observations when the holiday lands on a weekend) and `true` otherwise. `computeTradingDayAge` powers the stale‑data guard by counting only trading days between two dates, while `nextTradingDay` skips over consecutive closures. The helper currently ships with a static holiday list; no additional configuration is required.

## API Additions

The feature flag exposes new JSON endpoints:

- `GET /api/returns/daily?from=YYYY-MM-DD&to=YYYY-MM-DD&views=port,excash,spy,bench_blended,cash&page=1&per_page=100`
- `GET /api/nav/daily?from=YYYY-MM-DD&to=YYYY-MM-DD&page=1&per_page=100`
- `GET /api/benchmarks/summary?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `POST /api/admin/cash-rate { effective_date, apy }`

`page`/`per_page` query parameters are optional (defaults: `1` and `100`) and paginate the time‑series data. Responses for list endpoints include a `meta` block (`page`, `per_page`, `total`, `total_pages`) plus `ETag` headers so clients can issue conditional requests. Validation errors surface as HTTP `400` with `{ error: "VALIDATION_ERROR", details: [...] }`.

## Data Freshness Guard

Price‑ and benchmark‑derived responses enforce a trading‑day‑aware freshness threshold. The server inspects the latest available adjusted‑close date for each payload and compares it to `FRESHNESS_MAX_STALE_TRADING_DAYS`. If the dataset is older than the threshold, the endpoint emits structured warnings and responds with HTTP `503` and `{ "error": "STALE_DATA" }` instead of returning stale analytics. Weekends and major US market holidays are excluded from the age calculation so expected gaps (e.g., long weekends) do not trigger false positives.

Guard applies to: `/api/prices/:symbol`, `/api/returns/daily`, `/api/nav/daily`, and `/api/benchmarks/summary`.

## Configuration

| Name | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| `DATA_DIR` | string | `./data` | No | Root directory for JSON tables. |
| `PRICE_FETCH_TIMEOUT_MS` | number | `5000` | No | Timeout for legacy price fetches. |
| `FEATURES_CASH_BENCHMARKS` | boolean | `true` | No | Enables cash & benchmark endpoints/jobs. |
| `JOB_NIGHTLY_HOUR` | number | `4` | No | UTC hour for the nightly accrual job. |
| `CORS_ALLOWED_ORIGINS` | string (CSV) | _(empty)_ | No | Whitelist of origins allowed by the API CORS policy. |
| `FRESHNESS_MAX_STALE_TRADING_DAYS` | number | `3` | No | Max allowable trading‑day age before guarded endpoints emit `503 STALE_DATA`. |

## Testing

- **Unit**: cash accrual, return math, and SPY track parity (`server/__tests__/cash.test.js`, `server/__tests__/returns.test.js`). |
- **Snapshot**: deterministic regression for blended vs. SPY vs. cash series (`server/__tests__/returns.snapshot.test.js`). |
- **Integration**: nightly job idempotency and API exposure (`server/__tests__/daily_close.test.js`). |
- **Property‑based**: randomized ledger stress harness validating cash floors, share conservation, and deterministic return rows (`server/__tests__/ledger.property.test.js`). |

## TODO

- None.

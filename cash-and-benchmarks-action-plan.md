
# Cash & Benchmarks Implementation Plan — Portfolio Manager (Server)

**Goal:** Implement cash as a first‑class position with daily interest accrual and add three comparable return views plus fair benchmarks:
1) **Portfolio (incl. cash)**, 2) **Risk sleeve (ex‑cash)**, 3) **All‑SPY counterfactual**, and **Blended benchmark** (cash+SPY at your actual daily weights).

> Why this approach? Comparing a cash‑holding portfolio against **100% SPY** alone is not risk‑matched and can mislead. We’ll show both: a fair **blended** benchmark and the **opportunity‑cost** “All‑SPY” track.

---

## Deliverables (must-ship)
- ✅ New transaction type: `INTEREST` (internal; increases CASH).
- ✅ Cash modeled as a position with price = `1.0` and a **daily cash yield** data source.
- ✅ Nightly job: daily cash interest accrual, NAV snapshot, and return step computation.
- ✅ Three return series: **Portfolio incl‑cash**, **Ex‑cash sleeve**, **All‑SPY ghost** (dividends reinvested).
- ✅ Benchmarks: **Blended (cash+SPY)** and **100% SPY**.
- ✅ Public API endpoints to fetch returns/benchmarks and daily weights.
- ✅ Unit and integration tests; reproducible backfill; migration scripts; docs.

---

## Data Model — Minimal Changes
> Keep it ORM‑agnostic; adapt to your stack.

### Tables (or models)
- **`transactions`**
  - `id`, `ts` (date), `type` ∈ {DEPOSIT, WITHDRAWAL, BUY, SELL, DIVIDEND, INTEREST, FEE}
  - `ticker` (nullable for cash interest if you store in a separate cash ledger), `quantity`, `amount`, `note`
  - Constraint: `INTEREST` is **internal** (not counted as external flow).
- **`prices`**
  - `date`, `ticker`, `adj_close` (use adjusted close for equities/ETFs; =1.0 for CASH)
- **`cash_rates`**
  - `effective_date`, `apy` (decimal) — piecewise‑constant APY timeline.
- **`nav_snapshots`**
  - `date`, `portfolio_nav`, `ex_cash_nav`, `cash_balance`, `risk_assets_value`
- **`returns_daily`**
  - `date`, `r_port`, `r_ex_cash`, `r_bench_blended`, `r_spy_100`, `r_cash`
- **`ghost_flows`** (optional; can be derived)
  - Materialized mapping of external flows (net deposits/withdrawals) used to simulate **All‑SPY**.

> If you already have equivalents, extend rather than duplicate.

---

## Business Rules & Formulas

### Cash interest accrual
- Daily rate from APY: `r_daily = (1 + apy)^(1/365) - 1`.
- Accrual: `interest_t = cash_{t-1} * r_daily`. Book a `transactions` row: `type=INTEREST, ticker=CASH, amount=interest_t`.

### Time‑weighted return (TWR)
- Daily step: `r_t = (MV_t - Flows_t) / MV_{t-1} - 1`, where `Flows_t` are **external** only.
- Period: `TWR = Π (1 + r_t) - 1`.

### Sleeves & benchmarks
- **Ex‑cash sleeve**: same formula but `MV` excludes cash (dividends stay in sleeve).
- **Blended benchmark** (risk‑matched):
  - `w_cash_t = cash_t / MV_t`; `r_bench_t = w_cash_t · r_cash_t + (1 − w_cash_t) · r_SPY_t`.
- **All‑SPY counterfactual**:
  - Reinvest each **external** flow on its flow date into SPY (use **adjusted close**). Compute TWR on that synthetic track.

### Cash drag (reporting)
- `Drag_vs_self = R_ex_cash − R_port_incl_cash`
- `Allocation_drag ≈ R_all_SPY − R_bench_blended`

---

## External Data (zero‑key preferred)
- **SPY prices with dividends**: use **adjusted close** (e.g., Yahoo Finance). Implement a provider interface so we can swap sources.
- **Cash APY**: single APY timeline (admin‑editable). Optionally import from bank CSV.

---

## API Additions (example; adapt routes/naming)
- `GET /returns/daily?from=YYYY-MM-DD&to=YYYY-MM-DD&views=port,excash,spy,bench`
  - Returns arrays for: `r_port`, `r_ex_cash`, `r_spy_100`, `r_bench_blended`, `r_cash`.
- `GET /nav/daily?from=...&to=...` → `portfolio_nav`, `ex_cash_nav`, `cash_balance`, `weights`.
- `GET /benchmarks/summary?from=...&to=...` → cumulative returns + cash drag metrics.
- `POST /admin/cash-rate` → upsert `{effective_date, apy}` (protected).

**Response shape (sketch):**
```json
{
  "series": {
    "r_port": [{"date":"2025-01-01","value":0.0012}, ...],
    "r_ex_cash": [...],
    "r_spy_100": [...],
    "r_bench_blended": [...],
    "r_cash": [...]
  }
}
```

---

## Nightly Job (idempotent)
1. Resolve **daily APY** for `t-1` (last full day).
2. Accrue interest → insert `INTEREST` (skip if already posted).
3. Fetch prices for `t-1` (SPY + held tickers; CASH=1.0).
4. Rebuild `nav_snapshots[t-1]`.
5. Compute daily returns and benchmarks into `returns_daily[t-1]`.
6. Persist **All‑SPY** step via ghost flows (derived from external flows on `t-1`).

Backfill command: `backfill --from=YYYY-MM-DD --to=YYYY-MM-DD` (idempotent; uses same functions).

---

## Implementation Steps (tell Codex to **modify files**, not just plan)

### Phase 0 — Detect stack & wire up
- [ ] Inspect repo, detect framework/ORM/scheduler.
- [ ] Create feature flag: `features.cash_benchmarks=true` (env + config file).

### Phase 1 — Schema & migrations
- [ ] Add `INTEREST` to enum/types.
- [ ] Create/alter tables: `cash_rates`, `nav_snapshots`, `returns_daily`.
- [ ] Migration scripts + rollback.

### Phase 2 — Core logic
- [ ] Implement module `finance/cash.py` → `daily_rate(date)`, `accrue_interest(date)`.
- [ ] Implement module `finance/returns.py` → TWR utilities (portfolio, sleeve), external flow detector.
- [ ] Implement module `finance/benchmarks.py` → blended benchmark & All‑SPY ghost.
- [ ] Provider `data/prices.py` with adapter (`YahooProvider` using adjusted close; injectable).

### Phase 3 — Scheduler / CLI
- [ ] Nightly task `jobs/daily_close.py` (accrue → prices → NAV → returns).
- [ ] CLI `backfill` using same functions.

### Phase 4 — API
- [ ] Add endpoints above with pagination and `from/to` validation.
- [ ] Document OpenAPI and examples.

### Phase 5 — Tests
- [ ] Unit tests for cash accrual, TWR, blended, All‑SPY.
- [ ] Golden tests for idempotency (double‑run produces same state).
- [ ] Integration test: simulate 6 months of flows, assert metrics.
- [ ] Coverage ≥ 85% for new modules; mutation tests optional if tool available.

### Phase 6 — Docs
- [ ] `docs/cash-benchmarks.md` with formulas, examples, and API usage.
- [ ] Changelog + migration notes.

---

## Acceptance Criteria (binary, verifiable)
- **A1**: `INTEREST` transactions posted daily for dates in range when `apy>0`.
- **A2**: `GET /returns/daily` returns 4 series (`r_port`, `r_ex_cash`, `r_spy_100`, `r_bench_blended`) for the requested range.
- **A3**: For a synthetic test portfolio with constant 50% cash and flat APY, `R_port` ≈ `0.5*R_SPY + 0.5*R_cash` (within 1 bp over 1y).
- **A4**: All‑SPY track equals TWR of a portfolio that buys SPY with the same dated external flows (property test).
- **A5**: Re‑running nightly job or backfill is idempotent (no duplicate interest; checks via unique keys).
- **A6**: Prices use **adjusted close** (confirmed in provider tests).

---

## Edge Cases & Notes
- **APY changes intra‑month**: pick the **effective APY** per day from `cash_rates` (left‑join last ≤ date).
- **Negative rates**: supported (rare, but keep math general).
- **Zero cash** day: accrual=0; benchmark still computed.
- **Dividends**: ensure they’re internal flows (not external) for TWR step.
- **Multiple currencies** (future): add FX layer; keep base in USD initially.
- **No price for a day**: carry forward last close *only* for NAV calc; still flag a data‑quality warning.

---

## Nice‑to‑haves (later)
- Volatility/Sharpe for each view; max drawdown.
- Rolling 30/90‑day cash drag.
- Configurable synthetic benchmarks (e.g., 60/40).

---

## Critique (so we stay honest)
- **Comparing to 100% SPY alone is not apples‑to‑apples.** Always show the blended benchmark beside it to avoid claiming “alpha” that is pure allocation effect.
- **Accrue daily** (not monthly) or TWR steps get distorted by one‑day jumps.

---

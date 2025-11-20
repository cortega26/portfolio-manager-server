<!-- markdownlint-disable -->
# Portfolio Manager — Core Audit, Fix Plan & Guardrails (for GPT Codex‑5)

**Repository**: `cortega26/portfolio-manager-server`  
**Objective**: Verify and harden *core logic, math and business rules*; implement missing pieces with **minimal risk**.  
**Mindset**: **PEV — Plan → Execute → Verify** on each task. **Do not stop at planning**; modify files, run tests, and provide artifacts.

---

## 0) Ground Truth & Scope

- **Portfolio math**: daily **TWR** (time‑weighted return) with external flows excluded from performance.
- **Cash**: modeled as a position `CASH` (price = `1`) with **daily interest accrual** via internal `INTEREST` transactions from an APY timeline.
- **Benchmarks**:
  - **Blended**: daily mix of `cash` and `SPY` by **start‑of‑day** weights.
  - **All‑SPY ghost**: invest each **external** flow into SPY total‑return on its flow date.
- **UI/Server**: keep current stack (Express backend + Vite/React frontend + file‑based persistence). If detection differs, **adapt but preserve API behavior**.

> If any assumption above doesn’t match the repo, detect and adapt while keeping the *business rules* unchanged.

---

## 1) Risks Detected (Fix Directives)

1. **Data source inconsistency**: SPY series must use **one** adjusted‑close provider everywhere.
   - **Directive**: Implement a **PriceProvider** interface; set **Yahoo Adjusted Close** as default for SPY and other tickers; add Stooq adapter only as fallback with normalization to adjusted series.

2. **Benchmark weight timing**: Blended benchmark must use **start‑of‑day** weights (pre external flows).
   - **Directive**: Compute weights from **end of prior day NAV** or **start‑of‑day state** before applying `Flows_t`.

3. **Accrual timing & idempotency**:
   - **Directive**: Accrue interest **every calendar day** using `r_daily = (1+APY)^(1/365)-1`.
   - Post a single `INTEREST` per `(portfolio_id, date)` with a unique key to prevent duplicates.

4. **Nightly price availability**:
   - **Directive**: Schedule the nightly job with a buffer (suggest **UTC 04:00–05:00**). If a price is missing, retry/backoff; if still absent, **carry forward** prior close for NAV only and **flag staleness** in logs/metrics.

5. **External vs internal flows**:
   - **Directive**: `DEPOSIT`/`WITHDRAWAL` are **external**; `DIVIDEND`/`INTEREST` are **internal**. Enforce via enums and validation.

6. **Security & input validation**:
   - **Directive**: Add `helmet`, strict `CORS` and **schema validation** (`zod` or `express-validator`) to every API route. Keep portfolio ID regex guards; validate query/body types.

7. **Tests & reproducibility**:
   - **Directive**: Add synthetic datasets and **golden tests** to prove math and idempotency; add a `backfill` CLI reusing the same codepaths as the nightly job.

---

## 2) Business Rules (Canonical Formulas)

### 2.1 Daily portfolio step (TWR)
Let `MV_t` be end‑of‑day market value, and `Flows_t` the **net external flow** during day `t`.

- **Step return**:  
  `r_t = (MV_t - Flows_t) / MV_{t-1} - 1`
- **Period TWR**:  
  `TWR = Π_t (1 + r_t) - 1`

**Internal events** (`DIVIDEND`, `INTEREST`) affect `MV_t` but are **not** part of `Flows_t`.

### 2.2 Cash interest (daily accrual)
- Daily rate from APY: `r_daily = (1 + apy)^(1/365) - 1`  
- Accrual amount: `interest_t = cash_{t-1} * r_daily`  
- Book: `INTEREST` (internal) that increases `CASH`.

### 2.3 Blended benchmark (risk‑matched)
- **Start‑of‑day** weights:  
  `w_cash_t = cash_{t-1} / MV_{t-1}`  
- **Returns**:  
  `r_bench_t = w_cash_t * r_cash_t + (1 - w_cash_t) * r_SPY_t`

### 2.4 All‑SPY counterfactual (“opportunity cost”)
- For each external flow on date `d`, buy SPY at **adjusted close** on `d`.  
- Compute TWR on this synthetic track.

### 2.5 Optional: Money‑weighted return
- Provide **XIRR** for the investor outcome (portfolio incl. cash).

---

## 3) Implementation Plan (Edit Files — not just plan)

> Follow PEV for each phase. If blocked, split minimally but **ship a working subset** behind a feature flag `features.cash_benchmarks`.

### Phase 0 — Detect & Wire
- Detect actual stack & scripts; preserve `npm run dev` / `npm run server`.
- Add feature flag in config/env.
- Add `pino` logger with request‑ID and upstream timing.

### Phase 1 — Models & Storage (file‑based)
- Add/confirm enums: `DEPOSIT`, `WITHDRAWAL`, `BUY`, `SELL`, `DIVIDEND`, `INTEREST`, `FEE`.
- Create/extend stores:
  - `cash_rates.json` (APY timeline; piecewise constant).
  - `nav_<id>.jsonl` (daily NAV snapshots; append‑only).
  - `returns_<id>.jsonl` (daily step returns, including `r_port`, `r_ex_cash`, `r_bench_blended`, `r_spy_100`, `r_cash`).

### Phase 2 — Price Provider
- Introduce `PriceProvider` interface: `get_adjusted_series(ticker, from, to)` with **timeout**, **retry**, **cache**.
- Implement `YahooProvider` (default) and optional `StooqProvider` (normalized to adjusted). Add unit tests and a mock.

### Phase 3 — Core Math
- `cash/dailyRate(date)`, `cash/accrue(date)` idempotent with unique key `(portfolio_id, date, 'INTEREST')`.
- `returns/twr.ts`: portfolio incl‑cash & ex‑cash functions; external flow detector.
- `benchmarks/index.ts`: blended (start‑of‑day weights) and All‑SPY ghost.

### Phase 4 — Scheduler & CLI
- Nightly job `jobs/daily_close.ts` (UTC 04:00–05:00). Steps:
  1) Resolve APY for `t-1`; accrue interest.
  2) Fetch adjusted prices.
  3) Build NAV snapshot.
  4) Compute `r_*` series.
- CLI: `npm run backfill -- --from=YYYY-MM-DD --to=YYYY-MM-DD` using the same functions.

### Phase 5 — API
- `GET /api/returns/daily?from&to&views=port,excash,spy,bench`
- `GET /api/nav/daily?from&to`
- `GET /api/benchmarks/summary?from&to` — cumulative returns + cash drag.
- `POST /api/admin/cash-rate` — upsert `{effective_date, apy}` (protected).  
All routes use schema validation and return typed JSON.

### Phase 6 — Frontend
- Add 4 line series (Portfolio, Ex‑cash, All‑SPY, Blended) with a toggle **Blended vs 100% SPY** and KPIs (TWR, XIRR, Cash Drag).

### Phase 7 — Docs
- `docs/cash-benchmarks.md` with formulas, examples, and API usage.
- Update README; state **Yahoo Adjusted Close** as SPY source across app.

---

## 4) Guardrails (Global)

1. **Single source of truth** for adjusted data (Yahoo). If fallback is used, **normalize** and log a warning.
2. **Idempotency**: accrual and backfill must be re‑runnable without duplication or drift.
3. **Determinism**: store full‑precision values; round **only in UI** (e.g., shares 6–8 dp; money 2–4 dp).
4. **Validation everywhere**: reject bad dates, unknown tickers, negative amounts (except `WITHDRAWAL`), and unknown transaction types.
5. **Staleness detection**: if price for `t-1` missing, mark `stale_price=true` in snapshot and continue with carry‑forward.
6. **External/Internal separation**: only `DEPOSIT` and `WITHDRAWAL` contribute to `Flows_t`.
7. **Time zones**: compute “yesterday” by **UTC**; store dates as ISO `YYYY‑MM‑DD`.
8. **Performance**: cache price series; avoid N×M loops in backfill; stream JSONL writes.
9. **Security**: `helmet`, strict CORS, rate limit `/api/prices/*`; sanitize paths; never use user input in file paths except validated IDs.
10. **Feature flag**: wrap new endpoints and jobs with `features.cash_benchmarks` to allow safe rollout.
11. **SPY parity**: the UI’s SPY must exactly match the provider used by the benchmark engine.

---

## 5) Tests (Acceptance — binary)

> Threshold: **≥85% coverage** on new modules; run in CI.

- **A1 — Allocation identity**: 50% cash @ 4% APY + 50% SPY → `R_port ≈ 0.5*R_cash + 0.5*R_SPY` within **1 bp** over 1y.
- **A2 — Flows invariance**: TWR invariant to splitting deposits (one vs many) given identical total and timing.
- **A3 — All‑SPY parity**: Real “only SPY” portfolio TWR == ghost All‑SPY TWR.
- **A4 — Idempotency**: Re‑run nightly/backfill twice → identical state; no duplicate `INTEREST`.
- **A5 — Internal events**: Dividends and interest do **not** change `Flows_t`.
- **A6 — Stale price handling**: Missing price carries forward and sets a staleness flag; next day reconciles.
- **A7 — Provider contract**: Yahoo adapter returns adjusted series with expected columns; error paths time out & retry.

---

## 6) CI & Ops

- **GitHub Actions**: run `lint`, `test`, `build`, `e2e (API ping)`; block PR on failing tests or coverage < threshold.
- **Backups**: `data/` directory is append‑mostly (JSONL). Add a weekly tarball job.
- **Observability**: log request IDs, timings, provider latency; emit warnings for stale data.

---

## 7) PR Checklist (Codex must include this in PR body)

- [ ] Uses **Yahoo Adjusted Close** as the single SPY source (UI + engine).
- [ ] Blended benchmark uses **start‑of‑day weights**.
- [ ] Interest accrual: daily, idempotent, one `INTEREST` per day.
- [ ] New endpoints implemented with validation and documented.
- [ ] Backfill CLI present and tested.
- [ ] Added tests A1–A7; coverage ≥85% (new code).
- [ ] Security hardening (helmet, CORS, rate limits).
- [ ] Docs updated (`docs/cash-benchmarks.md`, README SPY source).

---

## 8) Synthetic Dataset (for tests)

- **APY timeline**: `2025‑01‑01..∞ → 0.04` (4%)
- **Flows**:  
  - `2025‑02‑03 DEPOSIT 10,000`  
  - `2025‑04‑10 WITHDRAWAL -2,000`  
- **Holdings**: buy 50% SPY on 2025‑02‑03 at that day’s adjusted close; keep 50% cash.

**Expectations**: A1 identity within 1 bp; A3 parity if the real portfolio is “only SPY”.

---

## 9) How to Execute (prompt for Codex‑5)

> **You are GPT Codex‑5. Implement the fixes and features in this file. Edit files directly; don’t just plan.**
> 1) Detect stack and confirm scripts. 2) Add PriceProvider with Yahoo Adjusted Close (default) and optional Stooq fallback; unify SPY across UI and engine. 3) Implement start‑of‑day blended benchmark and All‑SPY ghost as specified. 4) Implement daily interest accrual (idempotent), nightly job, and backfill CLI. 5) Add endpoints and input validation. 6) Add tests A1–A7 and CI gates. 7) Update docs. 8) Open a PR with the checklist filled.
>
> **Acceptance**: All tests pass; coverage ≥85% on new code; SPY parity between UI and engine; idempotent accrual; docs updated.

---

## 10) Do / Don’t

**Do**: preserve existing APIs and dev scripts; write small modules; fail fast with helpful messages; log staleness.  
**Don’t**: change storage engine; compare to SPY price‑only series; accrue monthly lumps; treat dividends as external flows.

---

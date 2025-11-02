# Portfolio Manager — Code Quality & Architecture Audit

- **Assessment date:** 2025-10-22
- **Auditor:** gpt-5-codex (Code Quality)
- **Scope:** Express backend (`server/`), shared utilities (`shared/`), React frontend (`src/`)
- **Deliverables:** Findings summary, remediation backlog (see `backlog.csv`), Top 10 risks (see `audit/top_10_risks.md`)

## Executive Summary
The product ships a mature security and testing baseline, yet several high-impact issues remain in portfolio valuation and persistence flows. The fallback ROI calculator misprices portfolios with additional cash flows or dividends and becomes prohibitively slow on large ledgers. On the backend, duplicate transaction identifiers are silently discarded and JSON table writes still rewrite entire ledgers per request. Frontend persistence relies on serialising whole portfolios into `localStorage`, which fails for realistic data volumes. Addressing these items, alongside the noted UX and accessibility gaps, should be prioritised to preserve data integrity and performance while keeping the experience inclusive.

## Methodology
1. Static analysis of backend ledger/ROI utilities, Express routes, and persistence helpers (`server/app.js`, `server/data/storage.js`).
2. Runtime experiments via Node REPL to reproduce ROI fallback behaviour with dividends and staged purchases.
3. Frontend review of `PortfolioManagerApp`, persistence store, and key UI components (`HoldingsTab`, `TransactionsTab`, `ToastStack`).
4. Test suite gap analysis (`src/__tests__/roi*.js`, `server/__tests__/*.js`).
5. Generated remediation backlog with severity, effort, and ownership tagging.

## Key Findings (ranked)

| ID | Severity | Area | Summary |
|----|----------|------|---------|
| CQ-001 | S1 | Performance & Accuracy | ROI fallback ignores cash flows/dividends, producing wildly incorrect returns when the API is down. |
| CQ-002 | S1 | Performance | Fallback ROI performs `O(n²)` work over transactions, risking multi-second stalls on large portfolios. |
| CQ-003 | S1 | Data Integrity | Backend silently drops duplicate transaction UIDs, leading to undetected data loss. |
| CQ-004 | S1 | Frontend Persistence | Portfolio snapshots store full ledgers in `localStorage`, exceeding browser quotas for real customers. |
| CQ-005 | S2 | Performance | Fallback ROI triggers N+1 full-history price fetches per ticker, saturating the backend/external providers. |
| CQ-006 | S2 | Performance | JSON table storage rewrites entire tables for each upsert/delete, scaling poorly with 250k-transaction portfolios. |
| CQ-007 | S2 | UX/I18n | Holdings & transactions tables render share counts via `toFixed`, ignoring locale and introducing rounding artefacts. |
| CQ-008 | S2 | Accessibility/I18n | Toast dismiss controls ship a hard-coded English aria-label, breaking localisation and assistive clarity. |
| CQ-009 | S2 | Testing | ROI tests skip dividends/withdrawals scenarios, leaving the critical fallback bug unguarded. |
| CQ-010 | S2 | Maintainability | `server/app.js` is minified into ~70 dense lines, impeding review, blame, and static tooling. |

### CQ-001 — ROI fallback misprices cash flows *(S1, Backend + Frontend, Effort: 1–2d)*
- **Evidence:** `buildRoiSeries` only adjusts share counts on BUY/SELL transactions, ignoring deposits, withdrawals, dividends, and interest.【F:src/utils/roi.js†L140-L189】
- **Reproduction:** Simulating a staged purchase shows a 200% ROI despite only a 50% market move; dividends register as 0% return.【7ddfa2†L1-L28】【249c2e†L1-L24】
- **Impact:** When the remote ROI API is unavailable (a documented fallback path), customers see fabricated gains/losses, undermining trust and risk decisions.
- **Recommendation:** Reimplement fallback ROI with a cash-flow-aware TWR calculation mirroring `server/finance/returns.js`, including income events, and share code/tests between front and backend. Add regression tests for dividends/withdrawals.

### CQ-002 — Fallback ROI is quadratic in transactions *(S1, Performance, Effort: 1–2d)*
- **Evidence:** For every SPY data point, `buildRoiSeries` filters the entire transactions array, yielding `O(days × transactions)` complexity.【F:src/utils/roi.js†L146-L170】 With 250k transactions and multi-year histories, this devolves into tens of millions of operations per refresh.
- **Impact:** During ROI fallback (already a degraded mode), large customers encounter multi-second freezes or timeouts, compounding the outage.
- **Recommendation:** Pre-sort and iterate transactions once, advancing an index as dates progress. Memoise cumulative share balances to achieve linear complexity.

### CQ-003 — Duplicate transaction UIDs silently dropped *(S1, Data Integrity, Effort: ≤2h)*
- **Evidence:** `ensureTransactionUids` filters out repeated `uid`s, logs a warning, and returns success to the caller without surfacing errors to the client.【F:server/app.js†L1-L1】
- **Impact:** Legitimate edits (e.g., re-importing corrected CSV rows) can lose trades with no user feedback, leading to reconciliation gaps.
- **Recommendation:** Reject payloads containing duplicate `uid`s with a 409-style response and surface precise validation errors. Extend tests to assert the failure mode.
- **Resolution (2025-10-22):** Duplicate identifiers now trigger a 409 error with structured details, preventing silent data loss and logging the offending IDs (`server/app.js`).

### CQ-004 — Snapshot persistence exceeds `localStorage` *(S1, Frontend Persistence, Effort: 1–2d)*
- **Evidence:** `persistActivePortfolioSnapshot` clones and stores the entire transaction/signals/settings payload per portfolio inside `localStorage` without paging.【F:src/state/portfolioStore.js†L72-L109】
- **Impact:** Portfolios approaching the documented 250k transaction ceiling easily exceed the 5 MB storage quota, causing silent snapshot failures and repeated warning toasts.
- **Recommendation:** Move snapshots to indexedDB (or prune to metadata-only caches) with size caps, and stream large ledgers on demand.

### CQ-005 — Fallback ROI triggers N+1 full-history price fetches *(S2, Performance, Effort: 1–2d)*
- **Evidence:** `loadPrices` fans out one `/prices/:symbol?range=1y` call per ticker and only uses the trailing close, while the server fetches full daily history from upstream providers before caching.【F:src/PortfolioManagerApp.jsx†L286-L345】【F:src/utils/api.js†L44-L55】【F:server/app.js†L1-L1】
- **Impact:** In degraded mode the app hammers the backend and external data sources, risking rate limits precisely when stability is needed.
- **Recommendation:** Introduce a bulk price endpoint returning only current quotes or reuse cached monitoring data. Gate fallback ROI behind that aggregate call.

### CQ-006 — JSON storage rewrites entire tables per write *(S2, Performance, Effort: 1–2d)*
- **Evidence:** `JsonTableStorage.upsertRow` loads the whole table array and rewrites it on every update/delete.【F:server/data/storage.js†L52-L75】
- **Impact:** Persisting portfolios with hundreds of thousands of transactions forces repeated multi-megabyte reads/writes, lengthening save times and increasing corruption risk on failure.
- **Recommendation:** Introduce append-only journaling or chunked writes (e.g., per-portfolio directories) and background compaction to keep IO bounded.

### CQ-007 — Share displays ignore locale & precision *(S2, UX/I18n, Effort: ≤2h)*
- **Evidence:** Holdings and transactions tables render share counts via `toFixed(4)` without locale awareness, omitting thousands separators and mismatching user preferences.【F:src/components/HoldingsTab.jsx†L30-L76】【F:src/components/TransactionsTab.jsx†L120-L168】
- **Impact:** International users see misleading decimal formatting, and rounding to four decimals can distort fractional shares for high-precision assets.
- **Recommendation:** Pipe share counts through `formatNumber` with configurable fraction digits aligned to asset precision and locale.
- **Resolution (2025-10-22):** Share counts route through the i18n `formatNumber` helper with updated Vitest coverage, ensuring locale-aware rendering in holdings and transactions tables (`src/components/HoldingsTab.jsx`, `src/components/TransactionsTab.jsx`, `src/__tests__/HoldingsTable.test.tsx`).

### CQ-008 — Toast dismiss control not localised *(S2, Accessibility/I18n, Effort: ≤2h)*
- **Evidence:** The toast close button hardcodes `aria-label="Dismiss notification"` and bypasses the translation layer.【F:src/components/ToastStack.jsx†L48-L76】
- **Impact:** Screen reader users in non-English locales receive untranslated controls, regressing accessibility requirements.
- **Recommendation:** Drive the label through `useI18n()` (e.g., `t('toast.dismiss')`) and add coverage in RTL tests.

### CQ-009 — ROI tests miss income/cash-flow scenarios *(S2, Testing, Effort: ≤2h)*
- **Evidence:** Existing ROI unit/property tests only cover BUY/SELL scenarios, never asserting dividends or staged deposits.【F:src/__tests__/roi.test.js†L6-L107】【F:src/__tests__/roi.property.test.js†L15-L106】
- **Impact:** The fallback ROI regression (CQ-001) shipped without failing tests, leaving the suite blind to a core financial invariant.
- **Recommendation:** Add Vitest cases for dividends, withdrawals, and multi-contribution scenarios, covering both deterministic and property-based expectations.

### CQ-010 — `server/app.js` is effectively minified *(S2, Maintainability, Effort: 1–2d)*
- **Evidence:** The Express bootstrap packs hundreds of statements into 74 long lines, combining imports, middleware, and route logic onto line 1.【F:server/app.js†L1-L74】
- **Impact:** Reviewers cannot rely on diff granularity, blame, or automated formatters; tooling (linting, coverage) becomes brittle.
- **Recommendation:** Restore source formatting (one statement per line) or split modules by concern (auth, pricing, persistence) with proper lint hooks.

## Recommendations Overview
1. Treat CQ-001, CQ-002, CQ-003, and CQ-004 as release blockers; ship guarded fixes with regression tests.
2. Schedule performance hardening (CQ-005, CQ-006) immediately after to avoid cascading outages when fallback paths engage.
3. Close the UX/i18n gaps (CQ-007, CQ-008) alongside the ROI fixes to prevent repeated accessibility churn.
4. Expand testing around ROI and ledger flows (CQ-009) and unminify `server/app.js` (CQ-010) before the next major feature work.

Refer to `backlog.csv` for owner assignments, severity, and effort estimates.

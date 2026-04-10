# Portfolio Manager — Remediation Backlog

> Operational backlog derived from the 2026-03-27 financial/mathematical/product audit.
> Each ticket traces to one or more audit findings and is grouped by implementation phase.
> See `portfolio-manager-remediation-plan.md` for sequencing rationale and workstream details.

---

## Legend

| Field | Description |
|-------|-------------|
| **Ticket ID** | `PM-AUD-NNN` — sequential, prefixed for traceability |
| **Finding origin** | Audit finding ID(s) from 2026-03-27 audit (M-xx, F-xx, V-xx, A-xx) |
| **Type** | `bug` · `financial-semantics` · `ui-clarity` · `technical-debt` · `testing` · `enhancement` |
| **Severity** | `critical` · `high` · `medium` · `low` |
| **Priority** | `P0` (ship now) · `P1` (ship next) · `P2` (ship soon) · `P3` (hardening) · `P4` (optional) |
| **Effort** | `S` (<2h) · `M` (2–6h) · `L` (6–16h) · `XL` (>16h) |
| **Status** | `todo` · `in-progress` · `done` · `wont-do` |

---

## Phase 0 — Quick Wins (P0)

> **Goal:** Eliminate every semantic ambiguity and visual bug with zero formula changes.
> **Expected PR(s):** 1–2 small PRs. Can be grouped into a single PR.
> **Regression risk:** Minimal — labels, colors, and guards only.

---

### PM-AUD-001 — Rename "blended" benchmark to "Cash-Matched S&P 500"

| Field | Value |
|-------|-------|
| **Finding origin** | F-01 |
| **Type** | `financial-semantics` |
| **Severity** | `medium` |
| **Priority** | P0 |
| **Effort** | S |
| **Area** | Frontend — translations, chart legend, benchmark meta |
| **Dependencies** | None |
| **Risk** | Low — label change only |
| **Owner** | — |
| **Status** | `done` |

**Problem:** The term "blended" implies a multi-index blend (e.g., 60/40 stocks/bonds). The actual formula is `cashWeight × rCash + (1 - cashWeight) × rSPY` — a cash-allocation-matched SPY return.

**Acceptance criteria:**
- The word "blended" does not appear in any user-facing label, legend entry, or tooltip.
- Replaced by "Cash-Matched S&P 500" (or "Cash-Matched SPY" in compact contexts).
- Tooltip: "S&P 500 return adjusted for your portfolio's cash allocation on each day."

**Tests required:**
- Translation snapshot test updated.
- Chart legend render test asserts "Cash-Matched" label.

**Implementation notes:**
- Files: `src/i18n/translations.js` (all `blended` translation keys), `src/utils/roi.js` (line 21: `SERIES_META_FALLBACK` label for blended), `shared/benchmarks.js` (derived entry label if applicable).
- Internal variable names (`r_bench_blended`, `blended` data key) do NOT need renaming — they are internal identifiers, not user-facing.

---

### PM-AUD-002 — Rename "Historical Change" to "Equity Price Gain"

| Field | Value |
|-------|-------|
| **Finding origin** | F-02 |
| **Type** | `financial-semantics` |
| **Severity** | `medium` |
| **Priority** | P0 |
| **Effort** | S |
| **Area** | Frontend — translations, dashboard card |
| **Dependencies** | None |
| **Risk** | Low — label change only |
| **Owner** | — |
| **Status** | `done` |

**Problem:** "Historical Change" is ambiguous — it could mean total portfolio change, NAV change, or equity-only change. The actual formula is `totalValue - netStockPurchases` (market value of equities minus purchase cost), which is the unrealized equity price appreciation.

**Acceptance criteria:**
- Card label reads "Equity Price Gain" (or localised equivalent).
- Tooltip: "Current market value of open equity positions minus their total purchase cost. Does not include dividends, interest, or realised gains."
- Description field clarifies scope when pricing is complete.

**Tests required:**
- Translation snapshot test.
- Dashboard render test verifying new label appears.

**Implementation notes:**
- Files: `src/i18n/translations.js` (key `dashboard.metrics.historicalChange` and siblings).

---

### PM-AUD-003 — Add methodology disclosure to Total Return card's ROI sub-metric

| Field | Value |
|-------|-------|
| **Finding origin** | M-01 |
| **Type** | `financial-semantics` |
| **Severity** | `high` |
| **Priority** | P0 |
| **Effort** | S |
| **Area** | Frontend — translations, dashboard card description |
| **Dependencies** | None |
| **Risk** | Low — description text change only |
| **Owner** | — |
| **Status** | `done` |

**Problem:** The "Total Return" card shows a `totalRoiPct` value in its description computed as `(totalNav - netContributions) / netContributions × 100`. This is a simple capital ROI that does not account for timing of cash flows. It sits next to TWR and MWR metrics without any disclosure of its different methodology.

**Acceptance criteria:**
- The ROI percentage in the Total Return card description is prefixed with "Simple ROI:" or labelled as "Capital ROI".
- Tooltip on the card (or i18n description) states: "Simple return on net contributed capital. Does not weight for timing of deposits/withdrawals. See TWR and MWR for time-adjusted and cash-flow-adjusted returns."

**Tests required:**
- Translation snapshot test.

**Implementation notes:**
- Files: `src/i18n/translations.js` (key `dashboard.metrics.return.description`), `src/components/DashboardTab.jsx` (line 680 — description template).

---

### PM-AUD-004 — Add methodology disclosure to Portfolio ROI context card

| Field | Value |
|-------|-------|
| **Finding origin** | M-01 |
| **Type** | `financial-semantics` |
| **Severity** | `high` |
| **Priority** | P0 |
| **Effort** | S |
| **Area** | Frontend — translations |
| **Dependencies** | None |
| **Risk** | Low |
| **Owner** | — |
| **Status** | `done` |

**Problem:** The "Portfolio ROI" context card shows `latest.portfolio` — a cumulative return from the fallback/simple ROI series. Its detail text says "Absolute ROI on net contributed capital" but doesn't explain the methodology difference vs TWR (next card).

**Acceptance criteria:**
- Detail text explicitly states this is a simple (non-time-weighted) return.
- Tooltip distinguishes it from TWR: "This measures your total gain relative to net capital contributed. Unlike TWR, it is affected by deposit/withdrawal timing."

**Tests required:**
- Translation snapshot test.

**Implementation notes:**
- Files: `src/i18n/translations.js` (key `dashboard.context.portfolio.detail`).
- This ticket and PM-AUD-003 can be done together.

---

### PM-AUD-005 — Fix chart color collision between QQQ and Blended benchmark

| Field | Value |
|-------|-------|
| **Finding origin** | M-06 |
| **Type** | `bug` |
| **Severity** | `low` |
| **Priority** | P0 |
| **Effort** | S |
| **Area** | Frontend — chart configuration |
| **Dependencies** | None |
| **Risk** | Near zero |
| **Owner** | — |
| **Status** | `done` |

**Problem:** Both "Nasdaq-100" (qqq) and "Blended benchmark" use color `#f97316` (orange). When both series are enabled, they are visually indistinguishable.

**Acceptance criteria:**
- No two default benchmark series share the same hex color.
- Blended (now "Cash-Matched S&P 500") uses a distinct color — recommended: `#8b5cf6` (violet).

**Tests required:**
- Unit test asserting all entries in `SERIES_META_FALLBACK` have unique color values.

**Implementation notes:**
- File: `src/utils/roi.js` line 23 — change `color: "#f97316"` for the blended entry to `"#8b5cf6"`.

---

### PM-AUD-006 — Fix `weightsFromState` to guard against negative NAV

| Field | Value |
|-------|-------|
| **Finding origin** | M-04 |
| **Type** | `bug` |
| **Severity** | `low` |
| **Priority** | P0 |
| **Effort** | S |
| **Area** | Server — financial calculation |
| **Dependencies** | None |
| **Risk** | Near zero — adds safety to an edge case |
| **Owner** | — |
| **Status** | `done` |

**Problem:** `weightsFromState` (in `server/finance/portfolio.js:350`) only checks `state.nav === 0`. If NAV is negative (theoretically possible if prices are stale and cash is deeply negative), dividing by negative NAV would produce inverted weights.

**Acceptance criteria:**
- `weightsFromState({ nav: -100, cash: 50, riskValue: -150 })` returns `{ cash: 0, risk: 0 }`.
- `weightsFromState({ nav: 0, cash: 0, riskValue: 0 })` still returns `{ cash: 0, risk: 0 }`.
- Positive NAV behavior unchanged.

**Tests required:**
- Unit test with negative NAV → `{ cash: 0, risk: 0 }`.
- Existing positive-NAV tests unchanged.

**Implementation notes:**
- File: `server/finance/portfolio.js` line 350 — change `state.nav === 0` to `state.nav <= 0`.

---

### PM-AUD-007 — Guard SPY/QQQ gap cards against cross-methodology comparison

| Field | Value |
|-------|-------|
| **Finding origin** | V-04 |
| **Type** | `financial-semantics` |
| **Severity** | `medium` |
| **Priority** | P0 |
| **Effort** | S |
| **Area** | Frontend — metrics hook |
| **Dependencies** | None |
| **Risk** | Users who previously saw a gap value will see "—" when only simple ROI is available. This is correct — showing a misleading number is worse. |
| **Owner** | — |
| **Status** | `done` |

**Problem:** When `latest.portfolioTwr` is null, `comparisonBasePct` falls back to `latest.portfolio` (simple ROI) and computes `spyDeltaPct = simpleROI - spyCumulativeReturn`. This compares two metrics with fundamentally different methodologies.

**Acceptance criteria:**
- When `latest.portfolioTwr` is not a finite number, `spyDeltaPct` and `qqqDeltaPct` are both `null`.
- The SPY Gap and QQQ Gap context cards show "—" in this state.
- When `latest.portfolioTwr` IS available, behavior is unchanged.

**Tests required:**
- Unit test: `deriveDashboardMetrics` with `roiData` where `portfolioTwr` is null but `portfolio` is 0.15 and `spy` is 0.12 → assert `spyDeltaPct === null`.
- Unit test: `deriveDashboardMetrics` with `roiData` where `portfolioTwr` is 0.15 and `spy` is 0.12 → assert `spyDeltaPct === 0.03`.

**Implementation notes:**
- File: `src/hooks/usePortfolioMetrics.js` lines 184–191.
- Change: only compute `comparisonBasePct` from `portfolioTwr`. If `portfolioTwr` is not finite, set `spyDeltaPct = null`, `qqqDeltaPct = null`, `blendedDeltaPct = null`.

---

## Phase 1 — Return Annualization (P1)

> **Goal:** Add annualized return calculation — the single highest-impact formula addition.
> **Expected PR(s):** 1 PR.
> **Dependency:** Phase 0 labels must be merged (clean semantic environment for new metric).

---

### PM-AUD-008 — Implement `annualizeReturn` function

| Field | Value |
|-------|-------|
| **Finding origin** | M-02 |
| **Type** | `enhancement` |
| **Severity** | `high` |
| **Priority** | P1 |
| **Effort** | S |
| **Area** | Server — financial calculation |
| **Dependencies** | None (pure function) |
| **Risk** | Low — additive function, no existing logic changes |
| **Owner** | — |
| **Status** | `done` |

**Problem:** The app only shows cumulative returns. For portfolios > 1 year, cumulative returns are not comparable across time horizons.

**Acceptance criteria:**
- `annualizeReturn(cumulative, days)` returns `(1 + cumulative)^(365/days) - 1` using Decimal.js.
- Returns `null` when `days < 365` (guard against misleading extrapolation).
- Returns `0` when `cumulative === 0`.
- Handles negative cumulative returns correctly.

**Tests required:**
- Golden: `annualizeReturn(0.50, 730)` → approximately `0.2247` (±1e-4).
- Golden: `annualizeReturn(-0.20, 365)` → `-0.20` (identity for exactly 1 year).
- Edge: `annualizeReturn(0.10, 180)` → `null`.
- Edge: `annualizeReturn(0, 730)` → `0`.
- Edge: `annualizeReturn(-1.0, 730)` → `-1.0` (total loss).

**Implementation notes:**
- File: `server/finance/returns.js` — add exported function.
- Uses `Decimal.js` for consistency: `d(1).plus(cumulative).pow(d(365).div(days)).minus(1)`.

---

### PM-AUD-009 — Integrate annualized returns into summary and API response

| Field | Value |
|-------|-------|
| **Finding origin** | M-02 |
| **Type** | `enhancement` |
| **Severity** | `high` |
| **Priority** | P1 |
| **Effort** | M |
| **Area** | Server — returns summary, API contract |
| **Dependencies** | PM-AUD-008 |
| **Risk** | Medium — changes API response shape. Additive fields only, so backward compatible. |
| **Owner** | — |
| **Status** | `done` |

**Problem:** The API returns cumulative returns but no annualized values.

**Acceptance criteria:**
- `summarizeReturns` includes `annualized_r_port`, `annualized_r_spy_100`, etc. when period spans >= 365 days.
- These fields are absent (not present) when period < 365 days.
- `/api/benchmarks/summary` response includes annualized values.
- OpenAPI spec updated to document new optional fields.

**Tests required:**
- Integration test: `/api/benchmarks/summary` with 2-year data includes `annualized_r_port`.
- Integration test: `/api/benchmarks/summary` with 6-month data does NOT include `annualized_r_port`.
- API contract test updated.

**Implementation notes:**
- Files: `server/finance/returns.js` (extend `summarizeReturns`), API route handler, `docs/reference/openapi.yaml`.

---

### PM-AUD-010 — Display annualized TWR in dashboard context card

| Field | Value |
|-------|-------|
| **Finding origin** | M-02 |
| **Type** | `ui-clarity` |
| **Severity** | `high` |
| **Priority** | P1 |
| **Effort** | S |
| **Area** | Frontend — dashboard |
| **Dependencies** | PM-AUD-009 |
| **Risk** | Low — additive display change |
| **Owner** | — |
| **Status** | `done` |

**Problem:** The TWR context card shows cumulative TWR only. For portfolios > 1 year, the annualized value is more meaningful.

**Acceptance criteria:**
- When annualized TWR is available (portfolio >= 1 year), the TWR context card shows: "X.XX% (Y.YY% ann.)" or a subtitle with the annualized value.
- When not available (< 1 year), the card shows cumulative TWR only with no "ann." label.
- Tooltip explains: "Annualized return: the equivalent constant annual rate that would produce the same cumulative return over this period."

**Tests required:**
- UI render test with annualized data → shows "(ann.)" suffix.
- UI render test without annualized data → no "(ann.)" suffix.

**Implementation notes:**
- Files: `src/components/DashboardTab.jsx` (PerformanceContext section), `src/i18n/translations.js`.
- Data source: `returnsSummary.annualized_r_port` from API (piped via new `returnsSummary` prop).

---

## Phase 2 — Risk Metrics & Dashboard Restructure (P2)

> **Goal:** Add max drawdown, consolidate cards, improve charts.
> **Expected PR(s):** 2–3 PRs.
> **Dependency:** Phase 1 annualized return (appears in consolidated cards).

---

### PM-AUD-011 — Implement `computeMaxDrawdown` function

| Field | Value |
|-------|-------|
| **Finding origin** | F-05 |
| **Type** | `enhancement` |
| **Severity** | `medium` |
| **Priority** | P2 |
| **Effort** | S |
| **Area** | Server — financial calculation |
| **Dependencies** | None (pure function) |
| **Risk** | Low — additive |
| **Owner** | — |
| **Status** | `done` |

**Problem:** No risk metric exists in the app. Max drawdown is the most intuitive and practical one.

**Acceptance criteria:**
- `computeMaxDrawdown(dailyReturnRows)` returns `{ maxDrawdown, peakDate, troughDate }`.
- `maxDrawdown` is a negative decimal (e.g., -0.30 for a 30% drawdown).
- Returns `null` when fewer than 2 data points.
- Monotonically increasing series → `maxDrawdown = 0`.

**Tests required:**
- Golden: series [100, 110, 77, 90, 115] → maxDD = (77-110)/110 = -0.30, peak date = day 2, trough date = day 3.
- Edge: single point → null.
- Edge: all flat → 0.
- Edge: all declining → maxDD = total decline from first point.

**Implementation notes:**
- File: `server/finance/returns.js`.
- Algorithm: single-pass. Track `peak` (max cumulative value seen), `drawdown = (current - peak) / peak`, `maxDrawdown = min(drawdown)`.

---

### PM-AUD-012 — Expose max drawdown via API and display in dashboard

| Field | Value |
|-------|-------|
| **Finding origin** | F-05 |
| **Type** | `enhancement` |
| **Severity** | `medium` |
| **Priority** | P2 |
| **Effort** | M |
| **Area** | Server API + Frontend dashboard |
| **Dependencies** | PM-AUD-011 |
| **Risk** | Low — additive API field and new card |
| **Owner** | — |
| **Status** | `done` |

**Acceptance criteria:**
- `/api/benchmarks/summary` includes `max_drawdown: { value, peak_date, trough_date }` when data is sufficient.
- Dashboard displays a context card: "Max Drawdown: -X.X% (MMM YYYY – MMM YYYY)".
- Card absent or shows "—" for portfolios with < 30 data points.

**Tests required:**
- API contract test for new field.
- UI render test for drawdown card.

**Implementation notes:**
- Files: API route handler, `src/components/DashboardTab.jsx`, `src/i18n/translations.js`, `docs/reference/openapi.yaml`.

---

### PM-AUD-013 — Consolidate dashboard metric cards from 6 to 4

| Field | Value |
|-------|-------|
| **Finding origin** | V-01 |
| **Type** | `ui-clarity` |
| **Severity** | `medium` |
| **Priority** | P2 |
| **Effort** | M |
| **Area** | Frontend — dashboard layout |
| **Dependencies** | PM-AUD-001 through PM-AUD-004 (labels), PM-AUD-010 (annualized return in cards) |
| **Risk** | Medium — changes visible UI structure. No data lost, only reorganised. |
| **Owner** | — |
| **Status** | `done` |

**Problem:** 6 metric cards present related data redundantly. "Equity Balance" + "Net Stock Purchases" + "Historical Change" are three views of the same cost/value pair.

**Proposed consolidated metric cards:**

1. **Total NAV** — primary metric. Subtitle: "Equities {equityValue} · Cash {cashBalance} ({cashPct}%)"
2. **Total Return** — with desglose. Subtitle: "Realised {r} · Unrealised {u} · Income {i} · Simple ROI {roi}%"
3. **Net Contributions** — deposits minus withdrawals. Subtitle: "Gross buys {b} · Gross sells {s} · Net income {i}"
4. **Equity Price Gain** — (formerly Historical Change). Subtitle: "Market value minus purchase cost of open positions"

**Acceptance criteria:**
- Dashboard renders exactly 4 metric cards.
- All data previously visible across 6 cards is accessible via the 4 cards' subtitles/tooltips.
- No financial metric is deleted — only reorganised.

**Tests required:**
- Snapshot test for new card layout.
- Manual visual review.

**Implementation notes:**
- File: `src/components/DashboardTab.jsx` (`metricCards` array).

---

### PM-AUD-014 — Consolidate context cards: replace Cash Allocation with Max Drawdown

| Field | Value |
|-------|-------|
| **Finding origin** | V-01, F-05 |
| **Type** | `ui-clarity` |
| **Severity** | `medium` |
| **Priority** | P2 |
| **Effort** | S |
| **Area** | Frontend — dashboard layout |
| **Dependencies** | PM-AUD-012 (drawdown available) |
| **Risk** | Low — Cash Allocation info moves to NAV card subtitle (PM-AUD-013) |
| **Owner** | — |
| **Status** | `done` |

**Proposed consolidated context cards (5):**

1. **Portfolio TWR** (+ annualized when available)
2. **Gap vs S&P 500**
3. **Gap vs Nasdaq-100**
4. **Investor MWR**
5. **Max Drawdown** (new — replaces standalone Cash Allocation)

Cash Allocation percentage moves to the Total NAV metric card subtitle (PM-AUD-013).

**Acceptance criteria:**
- 5 context cards rendered.
- Cash allocation visible in NAV card subtitle.
- Max drawdown card present when data sufficient.

**Tests required:**
- Snapshot test.

---

### PM-AUD-015 — Improve ROI chart date formatting

| Field | Value |
|-------|-------|
| **Finding origin** | V-03 |
| **Type** | `ui-clarity` |
| **Severity** | `low` |
| **Priority** | P2 |
| **Effort** | S |
| **Area** | Frontend — chart component |
| **Dependencies** | None |
| **Risk** | Near zero |
| **Owner** | — |
| **Status** | `done` |

**Problem:** XAxis shows raw `YYYY-MM-DD` strings that overlap for long series. Tooltip doesn't show full date.

**Acceptance criteria:**
- XAxis `tickFormatter` shows abbreviated dates: "Jan '24", "Feb '24", etc.
- Tooltip label shows full date: "January 15, 2024".
- No date overlapping for 2-year series.

**Tests required:**
- Unit test for date formatter utility.

**Implementation notes:**
- File: `src/components/DashboardTab.jsx` (RoiChart XAxis config).
- Add a `formatShortDate(isoDate)` utility that parses YYYY-MM-DD and returns abbreviated month + 2-digit year.

---

### PM-AUD-016 — Add NAV growth chart (stacked area)

| Field | Value |
|-------|-------|
| **Finding origin** | V-02, F-04 |
| **Type** | `enhancement` |
| **Severity** | `medium` |
| **Priority** | P2 |
| **Effort** | M |
| **Area** | Frontend — new chart component |
| **Dependencies** | PM-AUD-015 (shared date formatting utility) |
| **Risk** | Medium — new component and data piping. NAV data already available from `/api/nav/daily`. |
| **Owner** | — |
| **Status** | `done` |

**Problem:** The only chart shows TWR (percentage). There is no visualization of absolute NAV growth vs contributions — the user cannot see "how did my wealth actually grow?"

**Acceptance criteria:**
- A stacked area chart appears below (or tabbed with) the TWR chart.
- Two areas: "Net Contributions" (bottom, solid) and "Market Gain" (top, shaded).
- When no NAV data is available, shows empty state message.
- Chart uses the same date formatting as the TWR chart.

**Tests required:**
- Render test: chart appears with mock NAV data.
- Render test: empty state when no data.

**Implementation notes:**
- Data source: `/api/nav/daily` (already available). `portfolio_nav` minus cumulative `netContributions` = market gain area.
- Use Recharts `AreaChart` with `stackId`.

---

## Phase 3 — Technical Hardening (P3)

> **Goal:** Address frontend/backend divergence transparency and close remaining test gaps.
> **Expected PR(s):** 1 PR.
> **Dependency:** Phases 0–2 (metrics must be stable before testing them).

---

### BUG-001 — Fix double percent sign in Total NAV card subtitle

| Field | Value |
|-------|-------|
| **Finding origin** | Phase 3 implementation review |
| **Type** | `bug` |
| **Severity** | `low` |
| **Priority** | P3 |
| **Effort** | S |
| **Area** | Frontend — i18n, tests |
| **Dependencies** | PM-AUD-013 |
| **Risk** | Near zero |
| **Owner** | — |
| **Status** | `done` |

**Problem:** The i18n template `dashboard.metrics.nav.description` includes a literal `%` after `{cashPct}`, but `cashPct` already contains the `%` symbol from `formatPercent`. Result: `(55.4%%)`.

**Fix:** Removed the literal `%` from the template in both EN and ES locales. Updated test assertion in `DashboardSummary.test.tsx`.

---

### PM-AUD-017 — Add "Approximate" badge when using frontend fallback ROI

| Field | Value |
|-------|-------|
| **Finding origin** | M-05, A-01 |
| **Type** | `ui-clarity` |
| **Severity** | `medium` |
| **Priority** | P3 |
| **Effort** | S |
| **Area** | Frontend — dashboard badges |
| **Dependencies** | None |
| **Risk** | Near zero — additive |
| **Owner** | — |
| **Status** | `done` |

**Acceptance criteria:**
- When `roiSource === "fallback"`, an "≈ Approximate" indicator appears near the chart title.
- Tooltip: "Using client-side approximation. Values may differ from the canonical server calculation by a few basis points."
- A JSDoc block at the top of `src/utils/roi.js:buildRoiSeries` documents the known precision limitation.

**Tests required:**
- UI test: badge visible when `roiSource="fallback"`.
- UI test: badge absent when `roiSource="api"`.

---

### PM-AUD-018 — Add golden financial tests for new formulas

| Field | Value |
|-------|-------|
| **Finding origin** | A-06, M-02, F-05 |
| **Type** | `testing` |
| **Severity** | `medium` |
| **Priority** | P3 |
| **Effort** | M |
| **Area** | Server — test suite |
| **Dependencies** | PM-AUD-008 (annualize), PM-AUD-011 (drawdown) |
| **Risk** | Near zero — test-only |
| **Owner** | — |
| **Status** | `done` |

**Scope:**
- Golden test fixture file: `server/__tests__/fixtures/returns/golden_annualized.json` with 2-year portfolio data and manually verified annualized returns.
- `annualizeReturn` edge case suite (see PM-AUD-008 tests).
- `computeMaxDrawdown` edge case suite (see PM-AUD-011 tests).
- `weightsFromState` negative NAV test (see PM-AUD-006 tests).

**Acceptance criteria:**
- All listed golden/edge-case tests exist and pass.
- Fixture file includes a comment block with the manual calculation for auditability.

---

### PM-AUD-019 — Add methodology-guard test for gap cards

| Field | Value |
|-------|-------|
| **Finding origin** | V-04 |
| **Type** | `testing` |
| **Severity** | `medium` |
| **Priority** | P3 |
| **Effort** | S |
| **Area** | Frontend — metrics hook test |
| **Dependencies** | PM-AUD-007 |
| **Risk** | Near zero |
| **Owner** | — |
| **Status** | `done` |

**Scope:**
- Unit test: `deriveDashboardMetrics` with `portfolioTwr = null`, `portfolio = 0.15`, `spy = 0.12` → `spyDeltaPct === null`.
- Unit test: `deriveDashboardMetrics` with `portfolioTwr = 0.15`, `spy = 0.12` → `spyDeltaPct === 0.03`.

**Acceptance criteria:**
- Both tests exist and pass.
- Tests live in `src/__tests__/DashboardTab.metrics.test.jsx` or equivalent.

---

### PM-AUD-020 — Add frontend fallback precision divergence test

| Field | Value |
|-------|-------|
| **Finding origin** | M-05, A-01 |
| **Type** | `testing` |
| **Severity** | `low` |
| **Priority** | P3 |
| **Effort** | M |
| **Area** | Frontend — test suite |
| **Dependencies** | None (can run against current code) |
| **Risk** | Near zero |
| **Owner** | — |
| **Status** | `done` |

**Problem:** No test quantifies the known precision divergence between the frontend fallback (`buildRoiSeries` with native floats) and the backend (`computeDailyReturnRows` + `summarizeReturns` with Decimal.js).

**Acceptance criteria:**
- A test feeds identical 500-day transaction + price data to both calculation paths.
- The test asserts cumulative return divergence is < 10 basis points.
- If divergence exceeds this threshold, the test fails — signaling that the fallback has degraded beyond acceptable bounds.

**Tests required:**
- This IS the test.

**Implementation notes:**
- File: `src/__tests__/roi.fallbackDivergence.test.js` (new).
- Import server-side functions as pure modules (they have no side effects).

---

### PM-AUD-021 — Add unique-color assertion for benchmark series

| Field | Value |
|-------|-------|
| **Finding origin** | M-06 |
| **Type** | `testing` |
| **Severity** | `low` |
| **Priority** | P3 |
| **Effort** | S |
| **Area** | Frontend — test suite |
| **Dependencies** | PM-AUD-005 |
| **Risk** | Near zero |
| **Owner** | — |
| **Status** | `done` |

**Acceptance criteria:**
- A unit test asserts that all entries in `SERIES_META_FALLBACK` have distinct `color` values.
- Prevents future color collisions when adding new benchmarks.

---

## Phase 4 — Optional Product Enhancements (P4)

> **Goal:** Move the app from "solid tracker" to "insightful portfolio tool."
> **Expected PR(s):** Separate PRs, each independent.
> **Dependency:** Phase 2 dashboard structure must be stable.

---

### PM-AUD-022 — Asset allocation pie/donut chart

| Field | Value |
|-------|-------|
| **Finding origin** | V-02 (missing allocation visualization) |
| **Type** | `enhancement` |
| **Severity** | `low` |
| **Priority** | P4 |
| **Effort** | M |
| **Area** | Frontend — new chart component |
| **Dependencies** | Phase 2 complete |
| **Risk** | Low |
| **Owner** | — |
| **Status** | `done` |

**Acceptance criteria:**
- A pie or donut chart shows current allocation by ticker (% of NAV).
- Cash shown as a separate slice.
- Hover shows ticker + value + percentage.

---

### PM-AUD-023 — Contribution by asset table

| Field | Value |
|-------|-------|
| **Finding origin** | F-04 |
| **Type** | `enhancement` |
| **Severity** | `low` |
| **Priority** | P4 |
| **Effort** | L |
| **Area** | Frontend + Server |
| **Dependencies** | Phase 2 complete |
| **Risk** | Medium — requires per-asset return attribution |
| **Owner** | — |
| **Status** | `done` |

**Acceptance criteria:**
- A table or chart shows each holding's contribution to total portfolio return.
- Contribution = weight × individual return.

---

### PM-AUD-024 — Configurable corporate actions table

| Field | Value |
|-------|-------|
| **Finding origin** | A-07 |
| **Type** | `technical-debt` |
| **Severity** | `low` |
| **Priority** | P4 |
| **Effort** | M |
| **Area** | Server — CSV import |
| **Dependencies** | None |
| **Risk** | Low |
| **Owner** | — |
| **Status** | `done` |

**Problem:** NVDA 10:1 and LRCX 10:1 split adjustments are hardcoded in `csvPortfolioImport.js`. This doesn't scale to future splits.

**Acceptance criteria:**
- Split rules are read from a configuration file or database table.
- Existing NVDA/LRCX rules migrated to the new format.
- CSV import applies splits from the configuration instead of hardcoded logic.

---

## Summary Statistics

| Phase | Tickets | Effort | Priority |
|-------|---------|--------|----------|
| Phase 0 | 7 | 7×S = ~7h | P0 |
| Phase 1 | 3 | 1×S + 1×M + 1×S = ~6h | P1 |
| Phase 2 | 6 | 2×S + 3×M + 1×S = ~16h | P2 |
| Phase 3 | 5 | 3×S + 2×M = ~10h | P3 |
| Phase 4 | 3 | 1×M + 1×L + 1×M = ~20h | P4 |
| **Total** | **24** | **~59h** | |

---

## Ticket Index (sorted by priority)

| ID | Title | Phase | Priority | Effort |
|----|-------|-------|----------|--------|
| PM-AUD-001 | Rename "blended" → "Cash-Matched S&P 500" | 0 | P0 | S |
| PM-AUD-002 | Rename "Historical Change" → "Equity Price Gain" | 0 | P0 | S |
| PM-AUD-003 | Methodology disclosure on Total Return ROI sub-metric | 0 | P0 | S |
| PM-AUD-004 | Methodology disclosure on Portfolio ROI context card | 0 | P0 | S |
| PM-AUD-005 | Fix chart color collision QQQ/Blended | 0 | P0 | S |
| PM-AUD-006 | Fix `weightsFromState` negative NAV guard | 0 | P0 | S |
| PM-AUD-007 | Guard gap cards against cross-methodology comparison | 0 | P0 | S |
| PM-AUD-008 | Implement `annualizeReturn` function | 1 | P1 | S |
| PM-AUD-009 | Integrate annualized returns into API | 1 | P1 | M |
| PM-AUD-010 | Display annualized TWR in dashboard | 1 | P1 | S |
| PM-AUD-011 | Implement `computeMaxDrawdown` function | 2 | P2 | S |
| PM-AUD-012 | Expose max drawdown via API + dashboard card | 2 | P2 | M |
| PM-AUD-013 | Consolidate metric cards from 6 to 4 | 2 | P2 | M |
| PM-AUD-014 | Consolidate context cards, add drawdown | 2 | P2 | S |
| PM-AUD-015 | Improve ROI chart date formatting | 2 | P2 | S |
| PM-AUD-016 | Add NAV growth stacked area chart | 2 | P2 | M |
| PM-AUD-017 | Add "≈ Approximate" fallback badge | 3 | P3 | S |
| PM-AUD-018 | Golden financial tests for new formulas | 3 | P3 | M |
| PM-AUD-019 | Methodology-guard test for gap cards | 3 | P3 | S |
| PM-AUD-020 | Frontend fallback precision divergence test | 3 | P3 | M |
| PM-AUD-021 | Unique-color assertion for benchmark series | 3 | P3 | S |
| PM-AUD-022 | Asset allocation pie/donut chart | 4 | P4 | M |
| PM-AUD-023 | Contribution by asset table | 4 | P4 | L |
| PM-AUD-024 | Configurable corporate actions table | 4 | P4 | M |

# Portfolio Manager — Remediation Plan

> Generated from the comprehensive financial/mathematical/product audit of 2026-03-27.
> This document operationalizes the audit findings into an executable implementation plan.

---

## A. Purpose

This plan converts the findings from the 2026-03-27 audit into a sequenced, professional, and executable remediation roadmap.

**What it seeks to elevate:**

| Dimension                | Current state                           | Target state                                                                  |
| ------------------------ | --------------------------------------- | ----------------------------------------------------------------------------- |
| Mathematical correctness | Solid backend (Decimal.js, TWR, XIRR)   | Same, with annualized returns and drawdown                                    |
| Financial semantics      | Correct numbers, ambiguous labels       | Every visible metric has an unambiguous, methodology-aware label              |
| Benchmark methodology    | Correct but mislabeled "blended"        | Names reflect actual methodology; no apples-to-oranges comparisons            |
| Risk communication       | Absent                                  | At least max drawdown visible                                                 |
| Information architecture | 12 cards, 1 chart — dense but noisy     | Consolidated cards, multiple chart types answering distinct questions         |
| Technical consistency    | Frontend fallback diverges from backend | Explicit degradation mode; minimized logic duplication                        |
| Testing                  | Strong backend, weak UI data-contract   | Golden financial tests, edge-case tests, fallback-vs-backend divergence tests |

---

## B. Scope

### In scope

- All findings from the 2026-03-27 audit (IDs M-01 through M-06, F-01 through F-06, V-01 through V-05, A-01 through A-07).
- Label/tooltip corrections, metric renaming, color fixes.
- New financial calculations: annualized returns, max drawdown.
- Dashboard card consolidation and chart improvements.
- New test coverage for financial formulas, edge cases, and fallback divergence.
- Documentation of metric definitions for future maintainers.

### Explicitly out of scope (for now)

- Multi-currency FX conversion at runtime (the app is USD-primary by design).
- Sharpe/Sortino/Information Ratio (desirable but lower priority than drawdown).
- Options/derivatives/margin support.
- Contribution-by-asset breakdown (Fase 4 optional).
- Mobile/accessibility compliance audit.
- Performance profiling or scaling to 10K+ holdings.
- Rewrite of the frontend fallback ROI engine to Decimal.js (documented as known limitation).

---

## C. Guiding Principles

1. **Single source of truth for financial logic.** The server (`server/finance/`) owns all canonical calculations. The frontend fallback (`src/utils/roi.js`) is an explicit degradation path, not an alternative source of truth.

2. **No mixed-methodology comparisons without disclosure.** If TWR is available, comparisons use TWR. If only simple ROI is available, gap cards show "—", not a cross-methodology delta.

3. **Every visible metric must be correct AND relevant.** Correctness alone is insufficient. A metric that is mathematically right but financially misleading is a product defect.

4. **Prefer clarity over density.** Removing a redundant card is better than adding a tooltip to explain why two cards show related numbers.

5. **Every sensible change ships with a test.** No formula change without a golden-value test. No label change without a snapshot or assertion.

6. **No overengineering.** Annualized returns = 3-line function. Max drawdown = single-pass accumulator. Corporate actions table = nice-to-have, not a prerequisite.

7. **Incremental, reviewable PRs.** Each phase can ship independently. No phase requires the next one to be valuable.

---

## D. Workstream Summary

| ID    | Workstream                     | Findings addressed           | Phase |
| ----- | ------------------------------ | ---------------------------- | ----- |
| WS-1  | Semantic labels & tooltips     | M-01, F-01, F-02, F-03, V-04 | 0     |
| WS-2  | Visual bug fixes               | M-04, M-06                   | 0     |
| WS-3  | Benchmark methodology guard    | V-04 (SPY/QQQ gap fallback)  | 0     |
| WS-4  | Return annualization           | M-02                         | 1     |
| WS-5  | Max drawdown metric            | F-05                         | 2     |
| WS-6  | Dashboard card consolidation   | V-01, V-02, V-03             | 2     |
| WS-7  | Chart improvements             | V-02, V-03                   | 2     |
| WS-8  | Frontend fallback transparency | M-05, A-01                   | 3     |
| WS-9  | Testing & hardening            | A-06 + all formula changes   | 0–3   |
| WS-10 | Optional product enhancements  | F-04, A-05, A-07             | 4     |

---

## E. Phased Prioritization

### Phase 0 — Quick Wins (low risk, high clarity improvement)

**Objective:** Eliminate every semantic ambiguity and visual bug that can be fixed with label/tooltip/color changes alone — no formula changes, no new calculations.

**Why first:** Zero risk of financial regression. Immediate improvement to product credibility. Unblocks nothing, but costs almost nothing.

**Dependency:** None.

**Regression risk:** Minimal — label and CSS changes only. Snapshot tests may need updating.

**Expected impact:** The dashboard stops making claims it can't back up ("blended" that isn't blended, "ROI" that mixes methodologies, identical colors for different series).

**Workstreams:** WS-1, WS-2, WS-3.

---

### Phase 1 — Return Annualization (critical financial gap)

**Objective:** Add annualized return calculation and display it in the dashboard when the portfolio spans more than 365 days.

**Why second:** This is the single highest-impact formula addition. Cumulative returns without temporal context are the most common source of investor misinterpretation. Depends on Phase 0 labels being correct so the new metric lands in a clean semantic environment.

**Dependency:** Phase 0 (labels must be correct before adding new metrics that reference them).

**Regression risk:** Low — pure new function, additive to existing summary. Requires golden test.

**Expected impact:** The app can now honestly compare performance across different time horizons.

**Workstream:** WS-4.

---

### Phase 2 — Risk Metrics & Dashboard Restructure

**Objective:** Add max drawdown, consolidate dashboard cards, and improve chart presentation.

**Why third:** These are the changes that transform the dashboard from "data dump" to "financial insight tool". They require the semantic foundation from Phase 0 and the annualization from Phase 1 to be in place.

**Dependency:** Phase 1 (annualized returns may appear in consolidated cards).

**Regression risk:** Medium — card removal/consolidation changes the UI structure. Requires careful snapshot testing and manual UX review.

**Expected impact:** The dashboard answers the three essential investor questions: "How did I do?" (TWR + annualized), "How much risk did I take?" (drawdown), "How did I get here?" (improved chart).

**Workstreams:** WS-5, WS-6, WS-7.

---

### Phase 3 — Technical Hardening

**Objective:** Address frontend/backend divergence, add explicit degradation badges, and close remaining test gaps.

**Why fourth:** These are invisible to the user but critical for long-term maintainability. They prevent silent drift between the canonical backend and the fallback frontend.

**Dependency:** Phases 0–2 (the metrics being tested must be stable).

**Regression risk:** Low — primarily additive (badges, tests, documentation).

**Expected impact:** Future developers can trust that the fallback path is explicitly marked as approximate, and that formula changes are caught by golden tests.

**Workstreams:** WS-8, WS-9.

---

### Phase 4 — Optional Product Enhancements

**Objective:** NAV growth chart, allocation chart, contribution by asset, corporate actions table.

**Why last:** These are genuinely valuable but not required for the app to be considered "approaching industry-grade". They add new features rather than fix existing deficiencies.

**Dependency:** Phase 2 (dashboard structure must be stable before adding more charts).

**Regression risk:** Low — additive features.

**Expected impact:** Moves the app from "solid tracker" to "insightful portfolio tool".

**Workstream:** WS-10.

---

## F. Implementation Plan by Workstream

---

### WS-1 — Semantic Labels & Tooltips

| Field                   | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ID**                  | WS-1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Title**               | Rename ambiguous metrics and add methodology disclosure                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Problem**             | Labels like "blended", "Historical Change", "Portfolio ROI" are mathematically correct but financially ambiguous. Users cannot distinguish between simple ROI, TWR, and MWR from the dashboard alone.                                                                                                                                                                                                                                                                                                                                                       |
| **Finding(s)**          | M-01, F-01, F-02, F-03                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Severity**            | high (M-01, F-01), medium (F-02, F-03)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Business objective**  | Every metric label communicates its methodology without requiring financial expertise                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Technical objective** | Update translation keys, tooltip strings, and card descriptions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Modules affected**    | `src/i18n/translations.js`, `src/components/DashboardTab.jsx`, `src/hooks/usePortfolioMetrics.js` (variable naming for clarity)                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Proposed solution**   | (a) Rename "blended" → "Cash-Matched S&P 500" in translations and chart legend. (b) Rename "Historical Change" → "Equity Price Gain" with tooltip: "Market value of open positions minus total purchase cost". (c) Rename the Total Return card's ROI sub-metric from implicit "ROI" to "Simple Capital ROI" with tooltip: "Total NAV minus net contributions, divided by net contributions. Does not account for timing of cash flows." (d) Add methodology note to Portfolio ROI context card: "Absolute ROI on net contributed capital (simple method)". |
| **Alternatives**        | Remove simple ROI entirely and only show TWR/MWR. Rejected: simple ROI is intuitive for basic users and is not wrong — it just needs disclosure.                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Risks**               | Existing users familiar with current labels may be briefly confused. Mitigated by tooltips.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Dependencies**        | None                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Tests required**      | Translation key snapshot tests. UI render tests verifying new labels appear.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Acceptance criteria** | No metric label uses the word "blended" without specifying the blend components. No card shows a "return" or "ROI" without a tooltip or subtitle disclosing the methodology.                                                                                                                                                                                                                                                                                                                                                                                |
| **Definition of done**  | Labels updated, tooltips added, translation keys updated, snapshot tests passing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Priority**            | P0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Estimate**            | S                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

---

### WS-2 — Visual Bug Fixes

| Field                   | Value                                                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **ID**                  | WS-2                                                                                                                                                               |
| **Title**               | Fix color collision and weightsFromState edge case                                                                                                                 |
| **Problem**             | QQQ and Blended benchmark share color `#f97316` — indistinguishable when both enabled. `weightsFromState` divides by NAV without guarding against negative values. |
| **Finding(s)**          | M-04, M-06                                                                                                                                                         |
| **Severity**            | low                                                                                                                                                                |
| **Business objective**  | Chart series are always visually distinguishable. Edge case doesn't produce nonsensical weights.                                                                   |
| **Technical objective** | (a) Change blended color to `#8b5cf6` in `src/utils/roi.js`. (b) Change `state.nav === 0` to `state.nav <= 0` in `server/finance/portfolio.js:350`.                |
| **Modules affected**    | `src/utils/roi.js` (line 23), `server/finance/portfolio.js` (line 350)                                                                                             |
| **Proposed solution**   | Two one-line changes.                                                                                                                                              |
| **Risks**               | Near zero. Color change is cosmetic. Weight guard adds safety without changing happy-path behavior.                                                                |
| **Dependencies**        | None                                                                                                                                                               |
| **Tests required**      | Unit test for `weightsFromState` with negative NAV. Visual confirmation that chart colors are distinct.                                                            |
| **Acceptance criteria** | No two default benchmark series share the same color. `weightsFromState({ nav: -100, cash: 50, riskValue: -150 })` returns `{ cash: 0, risk: 0 }`.                 |
| **Definition of done**  | Code changed, tests added, passing.                                                                                                                                |
| **Priority**            | P0                                                                                                                                                                 |
| **Estimate**            | S                                                                                                                                                                  |

---

### WS-3 — Benchmark Methodology Guard

| Field                   | Value                                                                                                                                                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ID**                  | WS-3                                                                                                                                                                                                                    |
| **Title**               | Prevent cross-methodology benchmark comparisons in gap cards                                                                                                                                                            |
| **Problem**             | When TWR is unavailable, the SPY/QQQ gap cards fall back to simple ROI (`latest.portfolio`) and compare it against benchmark cumulative returns. This is apples-to-oranges.                                             |
| **Finding(s)**          | V-04                                                                                                                                                                                                                    |
| **Severity**            | medium                                                                                                                                                                                                                  |
| **Business objective**  | Gap cards never compare metrics computed with different methodologies                                                                                                                                                   |
| **Technical objective** | In `usePortfolioMetrics.js`, set `spyDeltaPct` and `qqqDeltaPct` to `null` when `latest.portfolioTwr` is not available (i.e., when `comparisonBasePct` would fall back to simple ROI).                                  |
| **Modules affected**    | `src/hooks/usePortfolioMetrics.js` (lines 184–191)                                                                                                                                                                      |
| **Proposed solution**   | Change `comparisonBasePct` logic: if `portfolioTwr` is not finite, set `spyDeltaPct = null` and `qqqDeltaPct = null` instead of using the simple ROI fallback. The gap cards will show "—" until TWR data is available. |
| **Alternatives**        | Show the gap but with a disclaimer badge. Rejected: too complex for the value, and "—" is honest.                                                                                                                       |
| **Risks**               | Users who previously saw a gap value will now see "—" when ROI source is fallback. This is correct behavior — showing a misleading number is worse than showing no number.                                              |
| **Dependencies**        | None                                                                                                                                                                                                                    |
| **Tests required**      | Unit test for `deriveDashboardMetrics` where `portfolioTwr` is null but `portfolio` is finite — assert `spyDeltaPct` and `qqqDeltaPct` are both null.                                                                   |
| **Acceptance criteria** | `spyDeltaPct` and `qqqDeltaPct` are never computed from a simple ROI base when TWR is unavailable.                                                                                                                      |
| **Definition of done**  | Logic updated, test added, passing.                                                                                                                                                                                     |
| **Priority**            | P0                                                                                                                                                                                                                      |
| **Estimate**            | S                                                                                                                                                                                                                       |

---

### WS-4 — Return Annualization

| Field                   | Value                                                                                                                                                                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ID**                  | WS-4                                                                                                                                                                                                                                                                                        |
| **Title**               | Add annualized return calculation and dashboard integration                                                                                                                                                                                                                                 |
| **Problem**             | The app only shows cumulative returns. For portfolios spanning more than 1 year, cumulative returns are not comparable across different time horizons and mislead users about annualized performance.                                                                                       |
| **Finding(s)**          | M-02                                                                                                                                                                                                                                                                                        |
| **Severity**            | high                                                                                                                                                                                                                                                                                        |
| **Business objective**  | Users with portfolios > 1 year see annualized returns alongside cumulative, enabling fair cross-horizon comparison                                                                                                                                                                          |
| **Technical objective** | (a) Add `annualizeReturn(cumulative, days)` in `server/finance/returns.js`. Formula: `(1 + cumulative)^(365/days) - 1`. (b) Include annualized values in `summarizeReturns` output when period > 365 days. (c) Display annualized return in the dashboard TWR context card when applicable. |
| **Modules affected**    | `server/finance/returns.js`, `src/hooks/usePortfolioMetrics.js` (or ROI data flow), `src/components/DashboardTab.jsx`, `src/i18n/translations.js`                                                                                                                                           |
| **Proposed solution**   | Pure function: `annualizeReturn(cumulative, days) = d(1).plus(cumulative).pow(d(365).div(days)).minus(1)`. Only compute when `days >= 365`. Display as "(X.XX% ann.)" next to cumulative TWR in the context card. Use `Decimal.js` for consistency with existing server-side precision.     |
| **Alternatives**        | (a) Only show annualized, never cumulative. Rejected: cumulative is still useful for short periods. (b) Show both always. Rejected: for < 1 year, annualized extrapolation is misleading.                                                                                                   |
| **Risks**               | Annualizing a < 1 year period can be dangerously misleading (e.g., 10% in 2 months → 79% annualized). Guard: only show when period >= 365 days.                                                                                                                                             |
| **Dependencies**        | Phase 0 (labels must be clean before introducing new metrics).                                                                                                                                                                                                                              |
| **Tests required**      | Golden test: 50% cumulative over 730 days → ~22.47% annualized. Edge cases: exactly 365 days, 366 days, 0% cumulative, negative cumulative, < 365 days returns null.                                                                                                                        |
| **Acceptance criteria** | `summarizeReturns` output includes `annualized_r_port` (and similar) when period >= 365 days. Dashboard shows annualized TWR with "(ann.)" suffix for qualifying portfolios. Portfolios < 1 year show cumulative only with no annualized label.                                             |
| **Definition of done**  | Function implemented, integrated into summary and dashboard, golden tests passing, translation keys added.                                                                                                                                                                                  |
| **Priority**            | P1                                                                                                                                                                                                                                                                                          |
| **Estimate**            | M                                                                                                                                                                                                                                                                                           |

---

### WS-5 — Max Drawdown Metric

| Field                   | Value                                                                                                                                                                                                                                                                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ID**                  | WS-5                                                                                                                                                                                                                                                                                                                                     |
| **Title**               | Calculate and display maximum drawdown                                                                                                                                                                                                                                                                                                   |
| **Problem**             | The app has zero risk metrics. An investor cannot assess the worst-case experience of their portfolio. The dashboard has a bullish bias — it only communicates gains.                                                                                                                                                                    |
| **Finding(s)**          | F-05                                                                                                                                                                                                                                                                                                                                     |
| **Severity**            | medium                                                                                                                                                                                                                                                                                                                                   |
| **Business objective**  | Users see the worst peak-to-trough decline their portfolio experienced, contextualizing the return numbers with risk awareness                                                                                                                                                                                                           |
| **Technical objective** | (a) Add `computeMaxDrawdown(dailyReturnRows)` in `server/finance/returns.js`. Single-pass accumulator over cumulative return series. (b) Expose via API in benchmarks/summary or ROI daily response metadata. (c) Display in a new context card or as an enrichment of the existing dashboard.                                           |
| **Modules affected**    | `server/finance/returns.js`, API response (benchmarks/summary or ROI metadata), `src/components/DashboardTab.jsx`, `src/i18n/translations.js`                                                                                                                                                                                            |
| **Proposed solution**   | `computeMaxDrawdown(rows)`: iterate over rows maintaining `peak = max(peak, cumulativeValue)`. At each step, `drawdown = (cumulativeValue - peak) / peak`. Track `maxDrawdown = min(drawdown)` (most negative). Return `{ maxDrawdown, peakDate, troughDate }`. Display as a context card: "Max Drawdown: -12.3% (Jan 2025 – Mar 2025)". |
| **Alternatives**        | (a) Show trailing drawdown chart instead of just the max. Desirable but Phase 4 scope. (b) Show Calmar ratio (annualized return / max drawdown). Nice-to-have, not essential now.                                                                                                                                                        |
| **Risks**               | For very short portfolios (< 30 days), drawdown may be noisy and misleading. Guard: only show for portfolios with >= 30 data points.                                                                                                                                                                                                     |
| **Dependencies**        | WS-4 (annualized returns may be referenced in the same card section).                                                                                                                                                                                                                                                                    |
| **Tests required**      | Golden test: known series with peak 100, trough 70, recovery 110 → max DD = -30%. Edge cases: monotonically increasing series → 0% drawdown. Single data point → null. All-negative series.                                                                                                                                              |
| **Acceptance criteria** | `computeMaxDrawdown` returns correct values for golden test cases. Dashboard shows max drawdown card with dates when data is sufficient. Card absent for short portfolios.                                                                                                                                                               |
| **Definition of done**  | Function implemented, API exposes it, dashboard displays it, tests passing.                                                                                                                                                                                                                                                              |
| **Priority**            | P2                                                                                                                                                                                                                                                                                                                                       |
| **Estimate**            | M                                                                                                                                                                                                                                                                                                                                        |

---

### WS-6 — Dashboard Card Consolidation

| Field                   | Value                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ID**                  | WS-6                                                                                                                                                                                                                                                                                                                                                                                   |
| **Title**               | Reduce dashboard card count from 12 to 8–9 by merging redundant cards                                                                                                                                                                                                                                                                                                                  |
| **Problem**             | 6 metric cards + 6 context cards = cognitive overload. Several cards are derivations of the same base data (Equity Balance + Net Stock Purchases + Historical Change are three views of the same cost/value pair).                                                                                                                                                                     |
| **Finding(s)**          | V-01                                                                                                                                                                                                                                                                                                                                                                                   |
| **Severity**            | medium                                                                                                                                                                                                                                                                                                                                                                                 |
| **Business objective**  | Dashboard communicates the essential portfolio story without redundancy                                                                                                                                                                                                                                                                                                                |
| **Technical objective** | Merge metric cards. Proposed consolidated set: (1) Total NAV, (2) Total Return + ROI%, (3) Equity Value + cash breakdown in subtitle, (4) Net Contributions + income note. Context cards: (1) Portfolio TWR (+ annualized), (2) SPY Gap, (3) QQQ Gap, (4) Investor MWR, (5) Max Drawdown. Remove standalone "Historical Change" and "Net Stock Purchases" cards (fold into subtitles). |
| **Modules affected**    | `src/components/DashboardTab.jsx`, `src/i18n/translations.js`                                                                                                                                                                                                                                                                                                                          |
| **Proposed solution**   | Reduce `metricCards` array from 6 to 4 entries. Reduce context cards from 6 to 5 (replace Cash Allocation standalone card with max drawdown; move cash allocation to NAV card subtitle). This is a UI restructure, not a logic change.                                                                                                                                                 |
| **Alternatives**        | Keep all 12 but add a collapse/expand mechanism. Rejected: adds complexity without reducing noise.                                                                                                                                                                                                                                                                                     |
| **Risks**               | Users accustomed to current layout may miss removed cards. Mitigation: the information is not deleted, only reorganized into subtitles and tooltips.                                                                                                                                                                                                                                   |
| **Dependencies**        | WS-1 (labels), WS-5 (drawdown card).                                                                                                                                                                                                                                                                                                                                                   |
| **Tests required**      | Snapshot tests for new card structure. Manual UX review.                                                                                                                                                                                                                                                                                                                               |
| **Acceptance criteria** | Dashboard renders 4 metric cards + 5 context cards. No financial information is lost — only reorganized. All previous data is accessible via card subtitles or tooltips.                                                                                                                                                                                                               |
| **Definition of done**  | Cards restructured, translation keys updated, snapshot tests updated, manual review complete.                                                                                                                                                                                                                                                                                          |
| **Priority**            | P2                                                                                                                                                                                                                                                                                                                                                                                     |
| **Estimate**            | M                                                                                                                                                                                                                                                                                                                                                                                      |

---

### WS-7 — Chart Improvements

| Field                   | Value                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ID**                  | WS-7                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Title**               | Improve ROI chart date formatting and add NAV growth chart                                                                                                                                                                                                                                                                                                                                                                       |
| **Problem**             | The ROI chart has no date formatting on the X axis (raw YYYY-MM-DD strings overlap for long series). There is no chart showing absolute NAV growth vs contributions.                                                                                                                                                                                                                                                             |
| **Finding(s)**          | V-02, V-03                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Severity**            | medium                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Business objective**  | Charts answer two distinct questions: "How well did I invest?" (TWR chart) and "How did my wealth grow?" (NAV chart)                                                                                                                                                                                                                                                                                                             |
| **Technical objective** | (a) Add `tickFormatter` to XAxis that shows abbreviated dates (e.g., "Jan '24"). (b) Add tooltip date formatting. (c) Add a second chart: NAV growth as stacked area (contributed capital + market appreciation).                                                                                                                                                                                                                |
| **Modules affected**    | `src/components/DashboardTab.jsx` (chart section), potentially a new `NavGrowthChart` component, API data (NAV series already available from `/api/nav/daily`)                                                                                                                                                                                                                                                                   |
| **Proposed solution**   | (a) XAxis: `tickFormatter={(v) => formatShortDate(v)}` with a utility that parses YYYY-MM-DD and returns "MMM 'YY". (b) Tooltip: show full date. (c) NAV chart: use Recharts AreaChart with two stacked areas — "Net Contributions" (floor) and "Market Gain" (delta above contributions). Data source: `/api/nav/daily` already provides `portfolio_nav` and `cash_balance`; combine with `netContributions` from transactions. |
| **Alternatives**        | Use a tabbed interface to switch between TWR and NAV charts. Acceptable alternative if vertical space is a concern.                                                                                                                                                                                                                                                                                                              |
| **Risks**               | Adding a second chart increases page weight and API calls. Mitigated: NAV data is already fetched, just needs to be piped to a new component.                                                                                                                                                                                                                                                                                    |
| **Dependencies**        | WS-6 (dashboard restructure should happen first or concurrently to avoid double-rework).                                                                                                                                                                                                                                                                                                                                         |
| **Tests required**      | Date formatter unit tests. Chart render test verifying both charts appear with data.                                                                                                                                                                                                                                                                                                                                             |
| **Acceptance criteria** | ROI chart X axis shows abbreviated dates. Tooltip shows full date. NAV growth chart renders when NAV data is available.                                                                                                                                                                                                                                                                                                          |
| **Definition of done**  | Date formatting added, NAV chart implemented, tests passing.                                                                                                                                                                                                                                                                                                                                                                     |
| **Priority**            | P2                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Estimate**            | M                                                                                                                                                                                                                                                                                                                                                                                                                                |

---

### WS-8 — Frontend Fallback Transparency

| Field                   | Value                                                                                                                                                                                                                                                                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ID**                  | WS-8                                                                                                                                                                                                                                                                                                                                                 |
| **Title**               | Add explicit "Approximate" badge when using frontend fallback ROI                                                                                                                                                                                                                                                                                    |
| **Problem**             | `buildRoiSeries` in the frontend uses native JavaScript floats, not Decimal.js. For long histories, this can diverge from the backend by several basis points. Users cannot tell which data source is active.                                                                                                                                        |
| **Finding(s)**          | M-05, A-01                                                                                                                                                                                                                                                                                                                                           |
| **Severity**            | medium                                                                                                                                                                                                                                                                                                                                               |
| **Business objective**  | Users always know whether they are seeing canonical (backend) or approximate (fallback) data                                                                                                                                                                                                                                                         |
| **Technical objective** | (a) When `roiSource === "fallback"`, display an "Approximate" badge next to chart and affected cards. (b) Add tooltip explaining: "Using client-side approximation. Values may differ from the canonical server calculation by a few basis points." (c) Document the known precision divergence in a comment block at the top of `src/utils/roi.js`. |
| **Modules affected**    | `src/components/DashboardTab.jsx` (QuickActions badge already differentiates roiSource), `src/utils/roi.js` (documentation)                                                                                                                                                                                                                          |
| **Proposed solution**   | The `QuickActions` component already shows "Fallback ROI" in amber when `roiSource === "fallback"`. Enhance: (a) add the same badge near the chart title, (b) add the word "≈" (approximately equal) before percentage values in cards when in fallback mode, (c) add JSDoc at top of `buildRoiSeries` noting precision limitations.                 |
| **Alternatives**        | Rewrite frontend fallback to use Decimal.js. Rejected for now: high effort, low frequency of fallback usage, and the current precision is acceptable for approximate display.                                                                                                                                                                        |
| **Risks**               | None material. Additive change.                                                                                                                                                                                                                                                                                                                      |
| **Dependencies**        | None (can be done anytime, placed in Phase 3 for logical grouping).                                                                                                                                                                                                                                                                                  |
| **Tests required**      | Test that "Approximate" text/badge appears when `roiSource === "fallback"`.                                                                                                                                                                                                                                                                          |
| **Acceptance criteria** | When backend ROI is unavailable and fallback is active, the user sees a visible "≈ Approximate" indicator near every affected metric.                                                                                                                                                                                                                |
| **Definition of done**  | Badge added, tooltip added, documentation comment added, test passing.                                                                                                                                                                                                                                                                               |
| **Priority**            | P3                                                                                                                                                                                                                                                                                                                                                   |
| **Estimate**            | S                                                                                                                                                                                                                                                                                                                                                    |

---

### WS-9 — Testing & Hardening

| Field                   | Value                                                                                                                                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ID**                  | WS-9                                                                                                                                                                                            |
| **Title**               | Add golden financial tests, edge-case tests, and fallback divergence tests                                                                                                                      |
| **Problem**             | Backend financial tests are strong but missing annualized return and drawdown coverage. No test quantifies the float-vs-Decimal divergence. No test guards the methodology-mismatch fix (WS-3). |
| **Finding(s)**          | A-06 + all formula changes from WS-2, WS-3, WS-4, WS-5                                                                                                                                          |
| **Severity**            | medium (structural)                                                                                                                                                                             |
| **Business objective**  | Prevent silent regressions in financial calculations                                                                                                                                            |
| **Technical objective** | Add tests incrementally as each workstream ships.                                                                                                                                               |
| **Tests to add**        | See Section H for the complete testing strategy.                                                                                                                                                |
| **Modules affected**    | `server/__tests__/returns.test.js`, `server/__tests__/portfolio.test.js`, `src/__tests__/DashboardTab.metrics.test.jsx`, new test files as needed                                               |
| **Priority**            | P0–P3 (ships with each workstream)                                                                                                                                                              |
| **Estimate**            | M (cumulative across all phases)                                                                                                                                                                |

---

### WS-10 — Optional Product Enhancements

| Field                   | Value                                                                                                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ID**                  | WS-10                                                                                                                                                                        |
| **Title**               | NAV chart, allocation chart, contribution by asset, corporate actions table                                                                                                  |
| **Problem**             | The app lacks visualizations that answer "where is my money?" (allocation) and "what contributed most?" (contribution). Corporate action splits are hardcoded for NVDA/LRCX. |
| **Finding(s)**          | F-04, A-05, A-07                                                                                                                                                             |
| **Severity**            | low                                                                                                                                                                          |
| **Business objective**  | Move the app from "solid tracker" toward "insightful portfolio tool"                                                                                                         |
| **Technical objective** | (a) Asset allocation pie/donut chart from holdings data. (b) Contribution-by-asset table. (c) Configurable corporate actions table replacing hardcoded split rules.          |
| **Modules affected**    | New components, `server/import/csvPortfolioImport.js` (corporate actions)                                                                                                    |
| **Priority**            | P4                                                                                                                                                                           |
| **Estimate**            | L (total)                                                                                                                                                                    |

---

## G. Recommended Execution Sequence

```
Phase 0 (1 PR, or 2 small PRs)
├── WS-1: Rename labels/tooltips ──────────────┐
├── WS-2: Fix color + weightsFromState guard ──┤── Can be a single PR
├── WS-3: Guard gap cards methodology ─────────┘
│
Phase 1 (1 PR)
├── WS-4: Annualized return function + integration
│
Phase 2 (2–3 PRs)
├── WS-5: Max drawdown calculation + card ──────── PR 1
├── WS-6: Dashboard card consolidation ─────────── PR 2
├── WS-7: Chart date formatting + NAV chart ────── PR 2 or 3
│
Phase 3 (1 PR)
├── WS-8: Fallback transparency badge
├── WS-9: Remaining hardening tests
│
Phase 4 (separate PRs as desired)
├── WS-10a: Allocation chart
├── WS-10b: Contribution table
├── WS-10c: Corporate actions config
```

### Sequencing rationale

1. **Phase 0 ships first** because it requires no formula changes — only labels, colors, and guards. It can be reviewed and merged in a single session. It immediately eliminates the most embarrassing product issues (mislabeled benchmarks, cross-methodology comparisons).

2. **Phase 1 ships second** because annualized returns are the highest-impact formula addition and are prerequisite for Phase 2's card consolidation (the TWR card may show annualized values).

3. **Phase 2 items can be parallelized** — drawdown (WS-5) is independent of card consolidation (WS-6) and chart improvements (WS-7). However, WS-6 and WS-7 touch the same component (`DashboardTab.jsx`), so they should be in the same or consecutive PRs to avoid merge conflicts.

4. **Phase 3 is cleanup** — the fallback badge and remaining tests can ship anytime after the metrics they test are stable.

5. **Phase 4 items are independent** of each other and can ship in any order.

### What NOT to do

- Do not start WS-6 (card consolidation) before WS-1 (labels) — you'd restructure cards with incorrect labels.
- Do not add the drawdown card (WS-5) before the annualized return (WS-4) — the dashboard structure change should incorporate both new metrics at once.
- Do not rewrite the frontend fallback to Decimal.js (explicitly rejected) — the badge approach (WS-8) is pragmatic and sufficient.

---

## H. Testing & Validation Strategy

### Unit tests (ship with each workstream)

| Workstream | Test                                                                       | Type      |
| ---------- | -------------------------------------------------------------------------- | --------- |
| WS-2       | `weightsFromState` with negative NAV → `{ cash: 0, risk: 0 }`              | Unit      |
| WS-3       | `deriveDashboardMetrics` with null `portfolioTwr` → `spyDeltaPct === null` | Unit      |
| WS-4       | `annualizeReturn(0.50, 730)` → `~0.2247`                                   | Golden    |
| WS-4       | `annualizeReturn(0.10, 180)` → `null` (period < 365)                       | Edge case |
| WS-4       | `annualizeReturn(0, 730)` → `0`                                            | Edge case |
| WS-4       | `annualizeReturn(-0.20, 365)` → `-0.20`                                    | Identity  |
| WS-5       | `computeMaxDrawdown` with known peak/trough/recovery → -30%                | Golden    |
| WS-5       | `computeMaxDrawdown` with monotonic increase → 0%                          | Edge case |
| WS-5       | `computeMaxDrawdown` with single data point → null                         | Edge case |

### Financial golden tests (new fixture file)

Create `server/__tests__/fixtures/returns/golden_annualized.json`:

- 2-year portfolio with known cumulative return, verified annualized against Excel.
- Include the manual calculation in a comment block for auditability.

### Integration / data-contract tests

| Test                                                                                 | Purpose  |
| ------------------------------------------------------------------------------------ | -------- |
| `/api/benchmarks/summary` returns `annualized_r_port` when period >= 365 days        | Contract |
| `/api/benchmarks/summary` does NOT return `annualized_r_port` when period < 365 days | Guard    |
| ROI daily response includes `max_drawdown` in metadata                               | Contract |

### Fallback divergence test

Create `src/__tests__/roi.fallbackDivergence.test.js`:

- Feed identical 500-day transaction + price dataset to both `buildRoiSeries` (frontend) and `computeDailyReturnRows` + `summarizeReturns` (backend, imported as pure functions).
- Assert that the divergence is < 10 basis points.
- This quantifies and documents the known limitation.

### Manual UX validation (checklist per phase)

- [ ] Phase 0: Verify all renamed labels in both English locale. Verify chart colors are distinct. Verify gap cards show "—" when TWR unavailable.
- [ ] Phase 1: Verify annualized return appears only for portfolios > 1 year. Verify it does NOT appear for portfolios < 1 year.
- [ ] Phase 2: Verify dashboard has fewer cards. Verify no financial information is lost. Verify drawdown card shows dates. Verify NAV chart renders.
- [ ] Phase 3: Verify "≈ Approximate" badge appears when roiSource is fallback.

---

## I. Implementation Risks

| Risk                                                                               | Impact | Likelihood | Mitigation                                                                        |
| ---------------------------------------------------------------------------------- | ------ | ---------- | --------------------------------------------------------------------------------- |
| Breaking historical comparability (changing how cumulative returns are computed)   | High   | Low        | This plan does NOT change cumulative return formulas. Annualization is additive.  |
| Frontend/backend metric divergence after label changes                             | Medium | Low        | WS-3 explicitly eliminates the methodology-mismatch path.                         |
| Changing labels without updating tooltips/translations                             | Medium | Medium     | Translation key audit as part of WS-1. Snapshot tests catch missing keys.         |
| False confidence from incomplete metrics (drawdown without volatility)             | Low    | Medium     | Drawdown is the most intuitive risk metric. Sharpe/Sortino can be Phase 4.        |
| Dashboard bloat from adding drawdown card while not removing enough existing cards | Medium | Medium     | WS-6 explicitly consolidates cards. Net card count should decrease, not increase. |
| Annualized return misleading for exactly-1-year period with unusual performance    | Low    | Low        | Guard: only show for >= 365 days. Edge-case test included.                        |

---

## J. Criteria for "Approaching Industry-Grade"

These are verifiable assertions, not slogans. After completing Phases 0–2, the app should satisfy:

| #   | Criterion                                             | How to verify                                                                                            |
| --- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1   | No visible apples-to-oranges comparison               | Gap cards show "—" when TWR unavailable. Manual review confirms.                                         |
| 2   | Returns > 1 year show annualized value                | Golden test + UI test for 2-year portfolio.                                                              |
| 3   | Benchmark names reflect actual methodology            | "Cash-Matched S&P 500" appears in chart legend. No "blended" without specifics.                          |
| 4   | At least one material risk metric exists              | Max drawdown card visible for qualifying portfolios.                                                     |
| 5   | Dashboard communicates performance AND capital growth | TWR chart + NAV chart (or NAV card with breakdown) both present.                                         |
| 6   | Every ROI/return label discloses its methodology      | Tooltips present on all return-related cards. Translation key audit passes.                              |
| 7   | Critical formulas have golden tests                   | `annualizeReturn`, `computeMaxDrawdown`, `computeReturnStep`, `computeXirr` all have golden-value tests. |
| 8   | Frontend fallback is explicitly marked                | "≈ Approximate" badge visible when `roiSource === "fallback"`.                                           |
| 9   | No two chart series share the same color              | Visual inspection of all default benchmark combinations.                                                 |
| 10  | Edge cases don't produce nonsensical output           | `weightsFromState` with negative NAV returns zeros. XIRR with < 2 flows returns ZERO.                    |

After Phase 3, the app can be honestly described as: **"Mathematically correct, financially transparent, and approaching industry-grade for a personal portfolio tracker."**

The qualifier "approaching" remains until Phases 4+ deliver allocation visualization, contribution analysis, and volatility metrics — at which point the app would be competitive with mid-tier commercial portfolio tools.

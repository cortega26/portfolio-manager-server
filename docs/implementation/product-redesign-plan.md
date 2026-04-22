# Portfolio Manager — Product Redesign Plan

> Origin: Strategic product review of 2026-04-20.
> This document is the single authoritative execution plan for the five highest-impact
> product changes identified in that review. It is self-contained: it describes the problem,
> the rationale, the acceptance criteria, the implementation steps, and the backlog state
> for every phase.

---

## Backlog maintenance protocol

**This document owns its own backlog. The following rule is mandatory:**

> Every time a phase is started, completed, blocked, or substantially changed:
>
> 1. Update the status field for that phase in the **[Backlog](#backlog)** section below.
> 2. Update the `Last updated` field at the top of the backlog table.
> 3. Add a one-line entry under the phase's `Change log` heading with the date and what changed.
> 4. If a phase is cancelled or de-scoped, move it to the **Deferred / cancelled** subsection
>    and record the reason.
>
> Do not rely on git history alone. The backlog in this document must be readable and accurate
> without inspecting commits.

---

## Executive context

This plan addresses five structural changes identified by a product audit. Their common root cause
is that the app prioritises data collection over decision support. The app is technically
well-built but does not close the loop between the data it holds and the question the user
opens it to answer: _"What do I need to know or do today?"_

The five changes are ordered by dependency and risk. **Phase 1 is a prerequisite for
everything else**: no dashboard redesign, no actionable signals, and no analytics improvement
is credible if the underlying prices are stale or wrong without the user knowing.

---

## Backlog

Last updated: **2026-04-21**

| #   | Phase                             | Category          | Status | Owner      | Target sprint |
| --- | --------------------------------- | ----------------- | ------ | ---------- | ------------- |
| 1   | Price reliability stack           | Foundational fix  | `DONE` | —          | Sprint 1      |
| 2   | Dashboard daily check-in redesign | UX redesign       | `DONE` | 2026-04-20 | Sprint 2      |
| 3   | Zero-friction transaction entry   | Workflow redesign | `DONE` | —          | Sprint 2      |
| 4   | Realized gains / tax year view    | Feature addition  | `DONE` | 2026-04-20 | Sprint 3      |
| 5   | Action Inbox (signal redesign)    | Feature redesign  | `DONE` | 2026-04-21 | Sprint 3–4    |

**Status legend:** `NOT STARTED` · `IN PROGRESS` · `BLOCKED` · `IN REVIEW` · `DONE` · `DEFERRED`

---

## Dependencies

```
Phase 1 (Prices)
  └── Phase 2 (Dashboard)       — dashboard metrics are meaningless with stale prices
  └── Phase 3 (Tx entry)        — auto-fill price in form requires working price engine
  └── Phase 5 (Action Inbox)    — signal triggers are only valid with fresh prices

Phase 2 (Dashboard) ──► Phase 5 (Action Inbox)
  (Action Inbox feeds into Zone 2 of the redesigned dashboard)

Phase 3 (Tx entry) — no blocking dependency; can run in parallel with Phase 2

Phase 4 (Realized gains) — no dependency on Phases 2, 3 or 5;
  only needs the ledger to be stable (already true)
```

---

## Phase 1 — Price reliability stack

### Problem statement

The app's price engine currently has three active failure modes:

1. `PRICE_PROVIDER_FALLBACK=none` in `.env` disables the Yahoo fallback by configuration.
2. Stooq HTTP requests lack a `User-Agent` header; the CDN returns HTML captcha pages on
   rate-limited requests, which the parser silently discards, leaving prices stale.
3. Yahoo Finance v8 requires a session crumb + cookie pair for authenticated API calls;
   no crumb acquisition exists in the codebase.

The consequence: portfolio value, ROI, TWR, benchmark comparisons, and signal thresholds
are all derived from prices that may be one or more trading days old with no user-visible
warning beyond a badge the user must actively notice.

This is an integrity issue, not a UX issue. It is the highest-priority item in the plan.

### Acceptance criteria

- [ ] `PRICE_PROVIDER_FALLBACK` in `.env.example` and runtime defaults is set to `yahoo`.
- [ ] Stooq HTTP requests include a valid `User-Agent` header on every outbound request.
- [ ] Stooq response handler detects HTML (non-CSV) responses and treats them as a
      provider failure, triggering fallback — not a silent empty result.
- [ ] Yahoo Finance crumb acquisition is implemented:
  - Fetches crumb from `https://query1.finance.yahoo.com/v1/test/getcrumb` with a browser-like `User-Agent`.
  - Crumb + cookie pair cached in-memory with a 30-minute TTL.
  - On HTTP 401 or 403 from the Yahoo price endpoint, crumb is refreshed once and the
    request is retried. If the retry also fails, the provider is marked failed and the
    next provider in the chain is used.
- [ ] Staleness warning is surfaced in the UI: if the most recent price for any holding is
      older than one completed trading day, the price status badge shows `STALE` (not `cached`).
- [ ] All three test suites described in `spec.md` are implemented and passing:
  - Stooq hardening tests (User-Agent, HTML detection, fallback trigger)
  - Yahoo crumb auth tests (crumb fetch, caching, 401 retry, expiry)
  - Dual-provider fallback integration tests

### Implementation steps

#### Step 1.1 — Configuration fix (30 min)

**File:** `.env.example` (and any test fixture `.env`)

Change:

```
PRICE_PROVIDER_FALLBACK=none
```

To:

```
PRICE_PROVIDER_FALLBACK=yahoo
```

Verify that `server/data/priceProviderFactory.js` reads this env variable and that the
fallback chain is constructed correctly when value is `yahoo`.

**Verification:** Start the app, confirm that `priceProviderFactory` instantiates with a
two-provider chain (Stooq primary, Yahoo fallback). Check startup logs.

---

#### Step 1.2 — Stooq hardening (1–2 hours)

**File:** `server/data/prices.js` (or the Stooq provider module — locate via
`grep -r "stooq" server/` before editing)

Changes required:

1. Add `User-Agent` header to every Stooq `fetch()` call:

   ```js
   headers: {
     'User-Agent': 'Mozilla/5.0 (compatible; portfolio-manager/1.0)'
   }
   ```

2. After receiving the Stooq response body, add an HTML detection guard before CSV parsing:

   ```js
   const text = await response.text();
   if (text.trimStart().startsWith('<')) {
     throw new StooqProviderError('Stooq returned HTML (likely captcha/rate-limit)');
   }
   // proceed with CSV parse
   ```

3. Ensure the thrown error propagates to the provider chain as a provider failure
   (not swallowed), so the fallback is invoked.

**Verification:** Write a test that mocks the Stooq endpoint to return `<html>blocked</html>`
and asserts that (a) a `StooqProviderError` is thrown, and (b) the fallback provider is called.

---

#### Step 1.3 — Yahoo Finance crumb authentication (3–4 hours)

**New file:** `server/data/yahooFinanceCrumb.js`

Responsibilities:

- `fetchCrumb()`: GET `https://query1.finance.yahoo.com/v1/test/getcrumb` with browser-like
  headers. Extract and return the crumb string and the `Set-Cookie` header value.
- `getCrumb()`: Returns cached `{ crumb, cookie }` if within TTL (30 min); otherwise calls
  `fetchCrumb()`, caches, and returns.
- `invalidateCrumb()`: Clears the cache, forcing a fresh fetch on the next call.

**File:** Yahoo price provider module (locate via `grep -r "yahoo" server/data/`)

Changes required:

1. Before constructing the Yahoo Finance v8 URL, call `getCrumb()`.
2. Include `crumb` as a query parameter: `?crumb=${encodeURIComponent(crumb)}`.
3. Include the `Cookie` header in the request.
4. On HTTP 401 or 403 response:
   - Call `invalidateCrumb()`.
   - Retry the request once with a fresh crumb.
   - If the retry also fails, throw a `YahooProviderError` to trigger the next fallback.

**Verification:** Write tests for:

- Successful crumb fetch and cache hit (second call returns same crumb without re-fetching).
- Cache expiry (mock `Date.now()` advancing past 30 min; assert re-fetch is triggered).
- 401 response → crumb invalidation → retry → success.
- 401 response → crumb invalidation → retry → 401 → `YahooProviderError` thrown.

---

#### Step 1.4 — Staleness UI indicator (1 hour)

**Context:** The app already has a price status badge system (`live`, `eod_fresh`, `cached`,
`error`) in `DashboardTab.jsx` and `PricesTab.jsx`. The `eod_fresh` status means prices are
from the most recent completed trading day. The gap is that `cached` does not distinguish
between "cached from today" and "cached from three days ago."

**File:** `src/components/DashboardTab.jsx` (and `PricesTab.jsx` if it has its own badge logic)

Change:

- When computing the price status badge, check the `updatedAt` timestamp of the most
  recently fetched price against the previous completed trading day.
- If any holding's price is older than one completed trading day AND the status is not
  already `error`, display status as `STALE` with an amber/orange color (currently `stale`
  exists in the badge system — confirm existing label vs. new label).
- Tooltip on the `STALE` badge: "Prices may be out of date. Last successful fetch:
  [timestamp]. Click Refresh to retry."

**Verification:** Mock the price API to return prices with an `updatedAt` set to 48 hours ago.
Assert the badge renders as `STALE` with the correct color and tooltip text.

---

#### Step 1.5 — Test suite completion

Implement the three test suites from `spec.md`. Files to create:

- `server/__tests__/stooq_hardening.test.js`
- `server/__tests__/yahoo_crumb_auth.test.js`
- `server/__tests__/price_fallback_integration.test.js`

Run `npm test` and confirm all pass with no regressions to the existing suite.

---

### Change log

| Date       | Change                              |
| ---------- | ----------------------------------- |
| 2026-04-20 | Phase created. Status: NOT STARTED. |
| 2026-04-20 | Phase completed.                    |

---

---

## Phase 2 — Dashboard daily check-in redesign

### Problem statement

The `DashboardTab.jsx` (~1000 LOC) presents six information layers at equal visual weight
simultaneously: contribution area chart, allocation donut, ROI overlay chart, benchmark
comparison, metrics cards, and quick actions. A user opening the app cannot answer the
question "what do I need to know right now?" within 5 seconds without scanning the entire
screen.

Additionally, `DashboardTab.jsx` mixes formatting utilities, charting configuration, state
derivation, and render logic in a single file. This creates maintainability risk independent
of the UX problem.

### Acceptance criteria

- [ ] The dashboard opens with three visually distinct zones in a clear vertical hierarchy.
- [ ] Zone 1 (always visible, top): Today's NAV + absolute and percentage change from
      previous close. Price status badge. No other elements compete for visual priority.
- [ ] Zone 2 (middle, conditional): Actionable items surface. This section is empty if
      no signals are triggered and no positions have material moves. When empty, it renders
      a single neutral "All quiet" indicator — it does not disappear or cause layout shift.
      (Full content for this zone is defined in Phase 5; Phase 2 delivers the structural
      slot with a placeholder.)
- [ ] Zone 3 (below the fold): Allocation donut + performance summary (TWR, benchmark gap,
      max drawdown). Accessible by scrolling, not competing for primary attention.
- [ ] Charts (contribution area, ROI overlay) are accessible via an expandable section or
      secondary panel, not shown by default on the primary view.
- [ ] `DashboardTab.jsx` is decomposed into sub-components. Maximum target: 300 LOC in the
      parent orchestrator. Sub-components: - `DashboardZone1.jsx` — NAV + status badge - `DashboardZone2.jsx` — Action slot (placeholder in Phase 2, populated in Phase 5) - `DashboardZone3.jsx` — Performance summary + allocation - `DashboardChartsPanel.jsx` — Charts (contribution, ROI overlay)
- [ ] All existing metrics remain accessible; nothing is deleted.
- [ ] Existing Vitest tests for `DashboardTab` pass without modification to test assertions
      (component decomposition must not break test contracts).

### Implementation steps

#### Step 2.1 — Audit and map DashboardTab.jsx (1 hour)

Before making any changes:

1. Read `DashboardTab.jsx` in full.
2. Identify every logical block: state derivation, formatting helpers, each JSX section.
3. Map which blocks belong to which zone per the new hierarchy.
4. List every prop passed in and every hook consumed. Determine which must be passed to
   which sub-component.

Produce a short working note (can be inline comments or a scratch file) before writing
any code.

---

#### Step 2.2 — Extract formatting and utility functions (1 hour)

**New file:** `src/components/dashboard/dashboardFormatters.js`

Move out of `DashboardTab.jsx` all pure functions that format numbers, compute derived
display strings, or build chart data. These have no JSX dependency and can be independently
tested.

Examples to look for:

- Currency formatting helpers
- Percentage string builders
- Chart data transformation functions
- Color/status mapping functions

Run `npm test` after extraction. No behavioral change; this is a mechanical refactor.

---

#### Step 2.3 — Create Zone 1 component (1–2 hours)

**New file:** `src/components/dashboard/DashboardZone1.jsx`

Props it receives (determined from the audit in Step 2.1):

- `nav`: current portfolio NAV (number or Decimal)
- `navChange`: absolute change from previous close
- `navChangePct`: percentage change
- `priceStatus`: one of `live | eod_fresh | stale | error`
- `lastPricedAt`: timestamp string
- `onRefresh`: callback

Render:

- Large NAV number (primary typographic element on the page)
- Delta display: `+$X,XXX.XX (+X.XX%)` with color coding (green positive, red negative, grey zero)
- Price status badge (existing badge component or new inline version)
- Refresh button

Do not include any chart, donut, or metrics card in this component.

---

#### Step 2.4 — Create Zone 2 structural placeholder (30 min)

**New file:** `src/components/dashboard/DashboardZone2.jsx`

This component receives a `items` prop (array, initially empty). When `items` is empty,
render:

```
No alerts or action items. Portfolio is up to date.
```

When `items` is non-empty (populated in Phase 5), render the action inbox feed.

This establishes the structural slot without requiring Phase 5 to be complete first.

---

#### Step 2.5 — Create Zone 3 component (2 hours)

**New file:** `src/components/dashboard/DashboardZone3.jsx`

Props: `twr`, `twrAnnualized`, `spyGap`, `qqqGap`, `maxDrawdown`, `allocationData`

Render:

- Existing `AllocationChart` component (moved here, no changes to the component itself)
- Performance summary row: TWR · Annualized TWR · SPY gap · QQQ gap · Max drawdown
  (horizontal cards or a compact table — consistent with existing MetricsTab card style)

---

#### Step 2.6 — Create charts panel (1 hour)

**New file:** `src/components/dashboard/DashboardChartsPanel.jsx`

Wrap the contribution area chart and ROI overlay chart in a collapsible section. Default
state: collapsed. The collapse state persists in `localStorage` using the same pattern as
`usePersistentBenchmarkSelection`.

---

#### Step 2.7 — Reassemble DashboardTab.jsx (1–2 hours)

Replace the body of `DashboardTab.jsx` with:

```jsx
<DashboardZone1 {...zone1Props} />
<DashboardZone2 items={actionItems} />
<DashboardZone3 {...zone3Props} />
<DashboardChartsPanel {...chartProps} />
```

The orchestrator computes props from hooks (`usePortfolioMetrics`, etc.) and passes them
down. No display logic remains in the orchestrator.

**Run `npm test`.** Fix any failures caused by import path changes or prop signature changes.

---

### Change log

| Date       | Change                                                                                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-04-20 | Phase created. Status: NOT STARTED.                                                                                                                                       |
| 2026-04-20 | Phase completed. Steps 2.1–2.7 implemented; DashboardTab.jsx decomposed into 5 sub-components; orchestrator 88 LOC (target ≤ 300). 86 vitest + 368 node:test, 0 failures. |

---

---

## Phase 3 — Zero-friction transaction entry

### Problem statement

Adding a transaction is the only write operation in the app. Every other feature is read.
The current transaction form requires the user to manually supply:

1. Date (no default)
2. Transaction type (no smart pre-selection)
3. Ticker (no validation feedback until submit)
4. Amount (total dollars)
5. Price per share
6. Number of shares

Fields 4, 5, and 6 are mathematically over-specified: any two determine the third. The form
currently requires all three. Price is not pre-filled from the live price engine despite the
engine being available. Date is not defaulted to today despite most entries being same-day.

The result: entering a single buy takes 30–60 seconds and is error-prone. Backlogs accumulate.
Inaccurate records degrade every analytics feature.

### Acceptance criteria

- [ ] Date field defaults to today's date in YYYY-MM-DD format on form open.
- [ ] When transaction type is BUY or SELL and a valid ticker is entered (blur or debounce):
  - The price field is automatically populated with the current price from the price engine.
  - The price field remains editable; the user can override the auto-filled value.
  - A small label below the price field shows: "Auto-filled from [provider] at [HH:MM]"
    or "Price unavailable — enter manually" if no price is found.
- [ ] Amount, price, and shares fields are mutually computing:
  - If the user fills amount + price: shares is computed automatically (`shares = amount / price`).
  - If the user fills shares + price: amount is computed automatically (`amount = shares × price`).
  - If the user fills amount + shares: price is computed automatically (`price = amount / shares`).
  - The computed field is visually distinct (e.g., light grey background, italic) to signal
    it was derived, not directly entered.
  - The user can override the computed field; doing so re-locks it and recomputes another.
- [ ] When BUY is selected and the ticker has no existing position, the type defaults to BUY.
      When SELL is selected and the ticker has an existing position, the type defaults to SELL.
      (This is a soft default — user can always change the type.)
- [ ] For BUY transactions: as the user fills amount or shares, display inline:
      "Remaining cash after this buy: $X,XXX.XX" — updated on every keystroke via the
      existing `usePortfolioMetrics` cash calculation, without a round-trip to the server.
- [ ] All existing form validation rules remain enforced (non-negative cash enforcement,
      date format, required fields per type). The auto-fill and computation do not bypass
      server-side validation.
- [ ] Existing `TransactionsTab` tests pass without regression.

### Implementation steps

#### Step 3.1 — Audit TransactionsTab.jsx form state (30 min)

Read `TransactionsTab.jsx` fully. Document:

- Current form state shape (which fields, default values, validation rules).
- Where `handleAddTransaction` is defined and what it expects.
- Which props are passed in from `PortfolioManagerApp` (in particular: current holdings,
  cash balance, and the price-fetch callback).

---

#### Step 3.2 — Default date to today (15 min)

In the form's initial state object, change the `date` field default from `''` to:

```js
new Date().toISOString().slice(0, 10);
```

Ensure the form reset (after successful submission) also resets to today, not to `''`.

**Test:** Submit a transaction without touching the date field. Assert the transaction
is recorded with today's date.

---

#### Step 3.3 — Auto-fill price from price engine (2 hours)

The price engine is already accessible via `GET /api/prices/bulk`. The form already lives
in a component that has access to `apiClient`.

Changes:

1. Add a `useEffect` (or `onChange` handler) on the `ticker` field that fires when:
   - The transaction type is `BUY` or `SELL`.
   - The ticker value is 1–8 uppercase letters (basic format guard; not a full validity check).
   - The field loses focus (use `onBlur` to avoid a request on every keystroke).

2. Inside the handler, call `GET /api/prices/bulk?symbols={ticker}&latest=1`.

3. On success: populate the price field with the returned price. Set a separate state
   variable `{ source, timestamp }` to render the "Auto-filled from X at HH:MM" label.
   Mark the price field as `autofilled: true`.

4. On failure: set `priceAutoFillStatus: 'unavailable'`. Render the "Price unavailable"
   label. Do not populate the price field.

5. When the user manually edits the price field after auto-fill, clear `autofilled: true`
   and hide the auto-fill label.

---

#### Step 3.4 — Mutual field computation (3 hours)

The three fields `amount`, `price`, `shares` satisfy `amount = price × shares`.

Implementation approach: track which two fields the user has most recently edited as the
"locked" pair, and compute the third.

```
lockedFields: Set<'amount'|'price'|'shares'>  (max size 2)
```

Rules:

- When the user edits a field, add it to `lockedFields`.
- If `lockedFields.size === 2`, compute the third field from the other two using Decimal.js.
- If `lockedFields.size < 2`, do not compute (not enough information yet).
- When the form is reset, clear `lockedFields`.
- The computed field renders with a visual distinction (grey background + "computed" aria-label).
- If the user edits the computed field, it joins `lockedFields`, the oldest locked field
  is evicted, and the new third field is computed.

Use `Decimal.js` for all computation. Never use native JS arithmetic.

Edge cases to handle explicitly:

- Division by zero (price = 0 or shares = 0): do not compute, show no value.
- Negative values: preserve existing validation that rejects them.

---

#### Step 3.5 — Smart type default (1 hour)

When the ticker field is filled and the form's type is still at its initial default:

1. Look up the ticker in current holdings (passed as prop from `PortfolioManagerApp`).
2. If the ticker has zero shares: do not change anything (BUY is already the typical default).
3. If the ticker has a positive share count: pre-select `SELL` if the current type is the
   initial default.

This is a suggestion, not enforcement. The user can change the type at any time.

---

#### Step 3.6 — Inline remaining cash indicator (1 hour)

When type is `BUY` and `amount` has a value:

Compute: `remainingCash = currentCash - enteredAmount`

Display below the amount field:

- If `remainingCash >= 0`: "Remaining cash: $X,XXX.XX" in grey.
- If `remainingCash < 0`: "Insufficient cash: would exceed balance by $X,XXX.XX" in amber.
  (Note: this is informational only. Server-side enforcement remains the authoritative check.)

The `currentCash` value comes from the portfolio state already loaded in `PortfolioManagerApp`.
No additional API call needed.

---

### Change log

| Date       | Change                                                                                                                                                                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-04-20 | Phase created. Status: NOT STARTED.                                                                                                                                                                                                                                |
| 2026-04-21 | Phase completed. All 6 steps implemented: date defaults to today, price auto-fill from price engine, mutual field computation (Decimal.js), smart type default for existing holdings, remaining cash indicator. Both test gates green (86 vitest + 368 node:test). |

---

---

## Phase 4 — Realized gains / tax year view

### Problem statement

The app already tracks every buy, sell, dividend, and fee with full date and price
information. The ledger contains everything needed to compute realized gain/loss per lot,
holding period, and year-to-date totals. Yet none of this is surfaced in the UI as a
cohesive tax-year view. Users who need to file taxes must export raw transactions as CSV
and manually build this analysis in a spreadsheet.

This is a high-value feature that requires no new data collection — it is entirely a
presentation and computation layer over existing data.

### Acceptance criteria

- [ ] A "Realized Gains" section is accessible within the `MetricsTab` (or as a new tab
      if the MetricsTab becomes overcrowded — evaluate after audit).
- [ ] The view groups all closed lots by **calendar year**.
- [ ] Per-year summary row shows:
  - Total realized gains (all lots closed in that year)
  - Total realized losses (all lots closed in that year)
  - Net realized result
  - Number of closed lots
- [ ] Per-lot detail (expandable under each year): ticker, purchase date, sale date, cost
      basis, proceeds, gain/loss, holding period in days, and a computed label:
      "Short-term" (< 365 days) or "Long-term" (≥ 365 days).
- [ ] Unrealized gains as of December 31 of each historical year are shown separately as
      a reference row (marked clearly as "Unrealized at year-end — not realized income").
- [ ] Current year section shows unrealized gains as of today.
- [ ] A "Export as CSV" button exports the full lot-level table with all columns. The CSV
      is structured for direct import into a tax spreadsheet (one row per closed lot, headers
      match column names in the view).
- [ ] Lot matching uses **FIFO** (first in, first out). This is the most common assumption
      and avoids the need for user configuration. The UI states clearly: "Lot matching
      method: FIFO."
- [ ] The view shows a disclaimer: "For informational purposes only. Not tax advice.
      Consult a tax professional for your specific jurisdiction."
- [ ] All computed values use `Decimal.js`. No native JS arithmetic.

### Implementation steps

#### Step 4.1 — Implement FIFO lot matcher in server finance layer (3–4 hours)

**New file:** `server/finance/lotMatcher.ts`

Input: sorted array of transactions (all types).

Algorithm:

1. Maintain a per-ticker queue of open lots: `{ date, price, shares, uid }`.
2. On a BUY: push a new lot onto the queue.
3. On a SELL:
   - Dequeue lots from the front of the queue (FIFO) until `shares sold` is exhausted.
   - For partial lot matches (sell quantity < lot quantity), split the lot.
   - For each consumed lot, emit a `ClosedLot` record:
     ```
     { ticker, buyDate, sellDate, buyPrice, sellPrice, shares, costBasis, proceeds, gainLoss, holdingDays }
     ```
4. Return `{ closedLots: ClosedLot[], openLots: OpenLot[] }`.

Write comprehensive unit tests in `server/__tests__/lotMatcher.test.ts`:

- Single buy + full sell
- Single buy + partial sell (lot split)
- Multiple buys + single sell spanning multiple lots
- Multiple buys + multiple sells (complex FIFO sequence)
- Edge case: sell quantity > available shares (should throw or return error state —
  the app's existing `enforceNonNegativeCash` logic already prevents this in practice,
  but the lot matcher must not produce negative share counts silently)

---

#### Step 4.2 — Add API endpoint for realized gains (2 hours)

**File:** `server/routes/portfolio.ts` (or create `server/routes/gains.ts` if it becomes large)

New endpoint: `GET /api/portfolio/:id/realized-gains`

Response shape:

```json
{
  "method": "FIFO",
  "years": [
    {
      "year": 2024,
      "closedLots": [ ... ],
      "totalGain": "1234.56",
      "totalLoss": "-234.56",
      "netRealized": "1000.00",
      "lotCount": 7
    }
  ],
  "unrealizedToday": {
    "holdings": [ ... ],
    "totalUnrealized": "5678.90"
  }
}
```

All monetary values as strings (Decimal.js serialization). All dates as `YYYY-MM-DD`.

Authentication: same session-token middleware as all other portfolio endpoints.

---

#### Step 4.3 — Frontend realized gains view (3–4 hours)

**New file:** `src/components/RealizedGainsView.jsx`

This component fetches from the new endpoint and renders:

- A year accordion: each year collapses/expands its lot table.
- The current year is expanded by default; prior years are collapsed.
- Per-lot table columns: Ticker · Buy date · Sell date · Shares · Cost basis · Proceeds ·
  Gain/Loss · Days held · Term (Short/Long).
- Color coding: positive gain (green), negative loss (red), zero (grey).
- Year summary row pinned to the top of each year section.
- "Export year as CSV" button per year section + "Export all" button.
- Disclaimer footer.

---

#### Step 4.4 — Integrate into MetricsTab (30 min)

Evaluate current `MetricsTab.jsx` length and density. If adding a new section would make
it unworkable, create a new tab `Realized Gains` in the tab bar instead.

Either way: wire `RealizedGainsView` into the tab system and add the API call to the
`apiClient.js` client module.

---

#### Step 4.5 — CSV export implementation (1 hour)

In `RealizedGainsView.jsx`, implement the export button handler:

1. Take the `closedLots` array (already fetched from the endpoint).
2. Convert to CSV string using a simple array-to-CSV serializer (no external library needed;
   the `ReportsTab` already has a CSV export pattern — reuse it).
3. Trigger a browser download via `URL.createObjectURL(new Blob([csvString], { type: 'text/csv' }))`.

CSV columns: `year,ticker,buy_date,sell_date,shares,cost_basis,proceeds,gain_loss,holding_days,term`

---

### Change log

| Date       | Change                                                                                                                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-04-20 | Phase created. Status: NOT STARTED.                                                                                                                                                                                |
| 2026-04-20 | Step 4.1: `server/finance/lotMatcher.ts` — full FIFO algorithm using Decimal.js. 10 unit tests in `server/__tests__/lotMatcher.test.ts`. Test runner updated (`tools/run-tests.mjs`) to discover `.test.ts` files. |
| 2026-04-20 | Step 4.2: `GET /api/portfolio/:id/realized-gains` endpoint added to `server/routes/portfolio.ts`. `getRealizedGains()` added to `src/lib/apiClient.js`. All monetary values serialized as strings.                 |
| 2026-04-20 | Step 4.3: `src/components/RealizedGainsView.jsx` created. Year accordion, per-lot table, color-coded gain/loss display, loading/error states, disclaimer.                                                          |
| 2026-04-20 | Step 4.4: New "Realized Gains" tab added to `TabBar.jsx`. `nav.realizedGains` key added to both EN and ES locales in `translations.js`. Tab panel wired in `PortfolioManagerApp.jsx` with lazy import.             |
| 2026-04-20 | Step 4.5: CSV export embedded in `RealizedGainsView.jsx` (per-year and all-years). Reuses `triggerCsvDownload` from `src/utils/reports.js`. Status: DONE.                                                          |

---

---

## Phase 5 — Action Inbox (signal redesign)

### Problem statement

The current `SignalsTab` is a configuration matrix: it shows threshold percentages per
ticker. To use it, the user must:

1. Remember what thresholds they set.
2. Mentally compare current prices against those thresholds.
3. Decide whether any threshold has been crossed.
4. Navigate away to see whether the current price actually crossed it.

This places the synthesis work on the user. The backend already computes whether thresholds
are crossed via `POST /api/signals`. That result is surfaced only in the tab itself, not
in the primary screen, and not in a way that prompts action or tracks review history.

Additionally, there is no mechanism for the app to surface position-level events that
don't have a configured signal threshold (e.g., a position up 40% with no threshold set,
a position not reviewed in 60 trading days).

### Acceptance criteria

- [ ] `SignalsTab` is renamed to `Inbox` (or `Actions`) in the tab bar.
- [ ] The tab renders a feed of action items, ordered by urgency (triggered threshold
      signals first, then staleness notices, then informational milestones).
- [ ] Each feed item contains:
  - Ticker + position summary (current shares, current value)
  - The specific event: "Crossed -15% threshold (currently -17.2%)" or "Up 34% since
    last review (47 trading days ago)"
  - Two actions: **Dismiss** (mark as reviewed for this event) and **View position**
    (navigates to HoldingsTab filtered to that ticker).
- [ ] Threshold configuration is still accessible, moved to a collapsible "Configure
      thresholds" panel at the bottom of the same tab (not a separate screen).
- [ ] Dismiss state is persisted per item per portfolio. Use the existing SQLite storage
      layer to store a lightweight `inbox_reviews` table:
      `{ portfolio_id, ticker, event_type, event_key, dismissed_at }`.
      Dismissed items do not reappear unless the event recurs (e.g., threshold is crossed
      again after recovering).
- [ ] The `DashboardZone2` component created in Phase 2 is populated with the top 3 inbox
      items (triggered thresholds and critical moves only). A "See all" link navigates to
      the Inbox tab.
- [ ] When the inbox is empty (all items dismissed or no events active): render a clean
      "Portfolio is on track. No alerts." message. Do not artificially fill the inbox.
- [ ] The existing `POST /api/signals` endpoint continues to work without changes (backward
      compatibility).
- [ ] New endpoint: `GET /api/portfolio/:id/inbox` — returns computed feed items using the
      same signal evaluation logic, extended with holding-period and staleness rules.
- [ ] New endpoint: `POST /api/portfolio/:id/inbox/dismiss` — records a dismiss event.

### Implementation steps

#### Step 5.1 — Design the inbox event model (1 hour)

Define the event types the inbox produces. Recommended initial set:

| Event type                | Trigger condition                               | Urgency |
| ------------------------- | ----------------------------------------------- | ------- |
| `THRESHOLD_TRIGGERED`     | Signal threshold crossed (existing logic)       | High    |
| `LARGE_MOVE_UNREVIEWED`   | Position ±20% since last review                 | High    |
| `LONG_UNREVIEWED`         | No review in 30+ trading days + position ≥ $500 | Medium  |
| `NO_THRESHOLD_CONFIGURED` | Position ≥ $500 with no signal configured       | Low     |

Do not add more event types until these four are stable.

---

#### Step 5.2 — Database migration for inbox reviews (1 hour)

**File:** `server/migrations/index.js`

Add a new migration (next sequential version after the current highest):

```sql
CREATE TABLE IF NOT EXISTS inbox_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  portfolio_id TEXT NOT NULL,
  ticker TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_key TEXT NOT NULL,
  dismissed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_inbox_reviews_portfolio
  ON inbox_reviews (portfolio_id, ticker, event_type, event_key);
```

`event_key` is a deterministic string that identifies the specific event instance:

- For `THRESHOLD_TRIGGERED`: `{ticker}:{direction}:{threshold_pct}:{crossing_date}`
- For `LARGE_MOVE_UNREVIEWED`: `{ticker}:{sign}:{move_pct_rounded}:{period_start_date}`
- For others: `{ticker}:{event_type}:{period_date}`

---

#### Step 5.3 — Implement inbox computation in server (3–4 hours)

**New file:** `server/finance/inboxComputer.ts`

Inputs:

- Portfolio holdings (from existing portfolio state)
- Current prices (from price engine)
- Signal configuration (from portfolio state)
- Dismiss history (from `inbox_reviews` table)

Output: `InboxItem[]` sorted by urgency, filtered for non-dismissed events.

For `THRESHOLD_TRIGGERED`: reuse the existing signal evaluation logic from
`server/routes/signals.ts`. Do not duplicate — import and call the existing function.

For `LARGE_MOVE_UNREVIEWED`: compare current price to the price at the most recent
dismiss event for that position (or the average cost if never reviewed).

For `LONG_UNREVIEWED`: compute trading days elapsed since the most recent dismiss event
(or since the first transaction for that ticker if never reviewed).

---

#### Step 5.4 — Add inbox API endpoints (1–2 hours)

**File:** `server/routes/portfolio.ts`

Add:

`GET /api/portfolio/:id/inbox`

- Calls `inboxComputer` with the current portfolio state and prices.
- Returns `{ items: InboxItem[], computedAt: ISO8601 }`.

`POST /api/portfolio/:id/inbox/dismiss`

- Body: `{ ticker, eventType, eventKey }`
- Validates with Zod schema.
- Inserts a row into `inbox_reviews`.
- Returns `{ ok: true }`.

---

#### Step 5.5 — Build the Inbox tab UI (3–4 hours)

**New file:** `src/components/InboxTab.jsx`

Replace `SignalsTab.jsx`. Wire `InboxTab` into the tab bar where `SignalsTab` was.

Render:

- Feed of `InboxItem` components (one per item).
- Each item: urgency badge, ticker, event description, "Dismiss" and "View" buttons.
- "Dismiss" calls `POST /api/portfolio/:id/inbox/dismiss` then removes the item from
  the local feed state (optimistic update).
- "View position" navigates to `HoldingsTab` and sets a filter for that ticker
  (if `HoldingsTab` supports ticker filtering; if not, navigate to tab and leave filtering
  as a follow-on enhancement).
- Collapsible "Configure thresholds" panel at the bottom, containing the existing
  `SignalTableCard` component with no changes.
- Empty state message when no items.

---

#### Step 5.6 — Wire top 3 items into DashboardZone2 (1 hour)

**File:** `src/components/dashboard/DashboardZone2.jsx` (created in Phase 2)

`DashboardTab.jsx` already fetches portfolio metrics. Add a fetch for
`GET /api/portfolio/:id/inbox` in `DashboardTab.jsx` or in the `usePortfolioMetrics` hook.

Pass the top 3 `HIGH` urgency items to `DashboardZone2`. Render them as compact badges
with a "See all →" link pointing to the Inbox tab.

---

#### Step 5.7 — Migrate existing signal configuration (30 min)

The existing `portfolio_states.signals` object stores threshold configuration. This is not
changed. The inbox computation reads from it as-is. No migration of existing signal data
is needed.

Verify that after deploying this phase:

- Existing signal thresholds still work.
- The `POST /api/signals` endpoint still returns correct results.
- The `Configure thresholds` panel in the new Inbox tab reflects the saved thresholds.

---

### Change log

| Date       | Change                                                     |
| ---------- | ---------------------------------------------------------- |
| 2026-04-21 | Phase 5 implemented. Steps 5.1–5.7 complete. Status: DONE. |
| 2026-04-20 | Phase created. Status: NOT STARTED.                        |

---

---

## What this plan explicitly does NOT include

The following ideas were evaluated and rejected:

### 1. Mobile app or PWA

**Reason rejected:** The data model is local SQLite. Auth is PIN-based local session.
Adding a mobile client requires solving cloud sync, conflict resolution, and cross-device
auth before any user benefit. This is a full architectural rewrite, not a feature addition.
The Electron desktop constraint is a correct design choice for a local-first financial tool.
Do not revisit until the desktop experience is materially better than it currently is.

### 2. AI-powered recommendations

**Reason rejected:** The app's value proposition is financial accuracy and auditability.
Adding a recommendation layer introduces liability, requires model hosting or third-party
API calls, and will be ignored by users who understand that no general-purpose model knows
their tax situation, risk tolerance, or investment thesis. The Action Inbox (Phase 5)
delivers decision-support capability without the liability, cost, or complexity of a model
integration.

### 3. Brokerage API integration (automatic transaction import)

**Reason rejected:** Brokerage integrations require per-broker OAuth flows, schema
normalisation, rate limit handling, and ongoing maintenance as APIs change and break.
The CSV import path already exists. Phase 3 (zero-friction manual entry) addresses the
real problem — slow entry — without creating an ongoing maintenance liability. Revisit
this only after the manual entry experience is demonstrably insufficient.

---

## Implementation sequence summary

```
Sprint 1 (Week 1)
  └── Phase 1: Price reliability stack [BLOCKING]
        1.1  Configuration fix
        1.2  Stooq hardening
        1.3  Yahoo crumb authentication
        1.4  Staleness UI indicator
        1.5  Test suite completion

Sprint 2 (Weeks 2–3)
  ├── Phase 2: Dashboard redesign [PARALLEL]
  │     2.1  Audit DashboardTab.jsx
  │     2.2  Extract formatting utilities
  │     2.3  Zone 1 component
  │     2.4  Zone 2 structural placeholder
  │     2.5  Zone 3 component
  │     2.6  Charts panel
  │     2.7  Reassemble DashboardTab
  │
  └── Phase 3: Zero-friction transaction entry [PARALLEL]
        3.1  Audit TransactionsTab.jsx
        3.2  Default date to today
        3.3  Auto-fill price from engine
        3.4  Mutual field computation
        3.5  Smart type default
        3.6  Inline remaining cash indicator

Sprint 3 (Weeks 4–6)
  └── Phase 4: Realized gains / tax year view
        4.1  FIFO lot matcher (server)
        4.2  Realized gains API endpoint
        4.3  Frontend realized gains view
        4.4  Integrate into MetricsTab / new tab
        4.5  CSV export

Sprint 3–4 (Weeks 5–8)
  └── Phase 5: Action Inbox
        5.1  Design inbox event model
        5.2  DB migration for inbox reviews
        5.3  Inbox computation (server)
        5.4  API endpoints
        5.5  Inbox tab UI
        5.6  Wire into DashboardZone2
        5.7  Verify signal configuration migration
```

**Critical rule:** Do not begin Phase 2, 3, or 5 until Phase 1 is complete and all
Phase 1 acceptance criteria are verified. Dashboard metrics, transaction auto-fill,
and signal thresholds are all built on prices; they are not trustworthy until the
price engine is reliable.

---

## Risk register

| Risk                                                                      | Likelihood | Impact | Mitigation                                                                      |
| ------------------------------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------- |
| Yahoo Finance v8 API breaks without notice                                | Medium     | High   | Fallback chain means Stooq continues working; Yahoo failure degrades gracefully |
| FIFO lot matching produces unexpected results for complex trade histories | Medium     | High   | Comprehensive unit tests in Step 4.1 before any UI work                         |
| DashboardTab decomposition breaks existing tests                          | Low        | Medium | Run full test suite after Step 2.7; fix before proceeding                       |
| Zone 2 in Phase 2 is empty until Phase 5 ships                            | Certain    | Low    | Empty-state UX is explicitly designed in Step 2.4                               |
| Mutual field computation in Phase 3 causes confusing UX                   | Medium     | Medium | Limit lock to most recent two fields; make computed field visually obvious      |
| Inbox is too noisy if urgency filtering is too permissive                 | Medium     | Medium | Start with four event types only; tune thresholds before adding new types       |

---

_End of document._

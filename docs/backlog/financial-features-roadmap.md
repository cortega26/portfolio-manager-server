# Financial Features Roadmap

Features to evolve the portfolio tracker into a professional-grade investment toolkit, ranked by estimated user value vs. implementation complexity.

## Legend

| Icon | Meaning     |
| ---- | ----------- |
| ✅   | Implemented |
| 🔶   | Partial     |
| ⏳   | Not started |

---

## Phase 1 — Foundation KPIs (complete)

| Feature                      | Status | Description                                                     |
| ---------------------------- | ------ | --------------------------------------------------------------- |
| Sharpe Ratio                 | ✅     | Risk-adjusted return (annualized, rf = cash yield)              |
| Max Drawdown                 | ✅     | Largest peak-to-trough decline                                  |
| Current Drawdown             | ✅     | Distance from latest NAV peak                                   |
| Rolling Returns (1M/3M/1Y)   | ✅     | Windowed cumulative + annualized returns                        |
| Money-Weighted Return (XIRR) | ✅     | Investor return matched to SPY/QQQ with same cash flows         |
| Time-Weighted Return         | ✅     | Benchmark-comparable return free from deposit/withdrawal timing |

---

## Phase 2 — Portfolio Analytics

### 1. Sector Allocation

Break down holdings by sector (Technology, Healthcare, Financials, etc.) using a ticker-to-sector mapping.

- **Why:** Users see concentration risk at a glance — a portfolio with 80% in tech is very different from one diversified across sectors.
- **Implementation:**
  - Create a `shared/sectors.js` mapping common tickers to sectors (with a fallback lookup via a free API or local map of S&P 500 constituents)
  - Add a sector breakdown chart (horizontal bar or treemap) to the Dashboard or a new Insights tab
  - Show sector weight vs. benchmark (e.g., "Tech: 45% portfolio vs 30% SPY")
  - Add to CSV export for downstream analysis
- **Estimate:** 4–6h

### 2. Dividend Tracking & Income Dashboard

Track dividend income across holdings: yield %, ex-dates, payment dates, cumulative收入.

- **Why:** Income investors need to see dividend yield, payment calendar, and total income stream.
- **Implementation:**
  - Extend transaction types with `DIVIDEND` metadata (already supported as a type) and link to tickers
  - Add dividend-specific views: calendar of upcoming ex-dates, historical dividend income by month/year, yield on cost vs current yield
  - Add a small "Dividend Income" card to the Dashboard showing YTD and trailing 12 months
  - Support dividend reinvestment (DRIP) tracking as a future extension
- **Estimate:** 6–8h

### 3. Tax-Loss Harvesting Suggestions

Identify lots that can be sold to realize losses that offset gains, respecting wash-sale rules.

- **Why:** One of the most direct value-adds for taxable accounts — users can save real money.
- **Implementation:**
  - Review existing FIFO lot-matching engine in `server/finance/`
  - Add wash-sale rule detection (30-day window before/after sale)
  - Surface lots with unrealized losses sorted by tax-saving potential
  - Add a "Tax-Loss Harvesting" section to the dashboard, inbox, or Realized Gains tab
  - Show net realized gains/losses YTD and what could be harvested
- **Estimate:** 10–14h (wash-sale logic is subtle)

---

## Phase 3 — Trade & Performance Analytics

### 4. Win Rate & Trade Statistics

Classify every closed lot as a win or loss, then compute: win rate, avg gain/loss, profit factor, expectancy.

- **Why:** Traders want to know if their strategy works. A single "total return" number hides win/loss dynamics.
- **Implementation:**
  - Use the existing lot-matching engine to classify each closed lot (gain vs loss)
  - Compute: win rate (wins / total closed), avg win %, avg loss %, profit factor (gross gains / gross losses), expectancy (avg return per trade)
  - Break down by time period (monthly, yearly) and by ticker
  - Add a "Trade Statistics" card/section to the Dashboard or Inbox tab
  - Show distribution of returns (histogram view)
- **Estimate:** 4–6h

### 5. Trade Journal

Allow users to annotate trades with rationale, strategy tags, and screenshots.

- **Why:** The missing link between "what happened" (transactions) and "why it happened" (strategy). Builds trader discipline.
- **Implementation:**
  - Add a `trade_notes` table to SQLite (transaction_id, note text, tags, created_at)
  - Extend the transactions UI with a notes column/icon and a modal to view/edit notes
  - Add strategy tagging (e.g., "momentum", "value", "earnings play") with filter support
  - Optional: add a "Journal" tab showing chronologically grouped trade notes
  - Future: support screenshots/image attachments stored alongside notes
- **Estimate:** 8–12h

### 6. Risk Metrics (VaR, Beta, Correlation)

Add portfolio-level risk statistics: Value at Risk (95%/99%), portfolio beta vs SPY, and correlation matrix of holdings.

- **Why:** Professional investors quantify risk, not just return. VaR answers "what's my worst-case loss in a normal day?".
- **Implementation:**
  - Use daily return rows to compute: daily VaR (historical simulation or parametric), portfolio beta (covariance with SPY / variance of SPY), max diversification ratio
  - Add correlation matrix between top holdings (heatmap visualization)
  - Surface as a risk section in Dashboard or a new Analytics tab
  - Include rolling 60-day beta chart
- **Estimate:** 8–10h

---

## Phase 4 — Automation & Reporting

### 7. Rebalancing Recommendations

Compare current allocation vs target allocation and generate rebalance trades.

- **Why:** Drift happens. Automated rebalancing suggestions keep the portfolio aligned with the user's strategy.
- **Implementation:**
  - Allow users to set target allocation percentages per ticker or per sector in Settings
  - Compare current vs target, compute required buys/sells to rebalance
  - Show drift % per holding and estimated shares to trade
  - Surface as an inbox item or a dedicated "Rebalancing" section
  - Support drift tolerance threshold setting
- **Estimate:** 6–8h

### 8. Performance Reports (PDF)

Generate downloadable PDF reports with summary, charts, and key metrics.

- **Why:** Users want to share portfolio performance with accountants, advisors, or family members without granting app access.
- **Implementation:**
  - Use a server-side PDF library (PDFKit, Puppeteer) to render a report
  - Include: NAV chart, ROI vs benchmarks, top holdings, realized gains, key metrics
  - Offer date-range selection and periodic (monthly/quarterly) auto-generation
  - Add download button in Reports tab
- **Estimate:** 10–14h

---

## Current snapshot

| Feature                                 | Priority | Complexity | Status |
| --------------------------------------- | -------- | ---------- | ------ |
| Sharpe Ratio, Drawdown, Rolling Returns | P0       | Medium     | ✅     |
| Sector Allocation                       | P1       | Low        | ⏳     |
| Win Rate / Trade Stats                  | P1       | Low        | ⏳     |
| Dividend Tracking                       | P1       | Medium     | ⏳     |
| Tax-Loss Harvesting                     | P2       | High       | ⏳     |
| Trade Journal                           | P2       | High       | ⏳     |
| Risk Metrics (VaR, Beta)                | P2       | High       | ⏳     |
| Rebalancing Recommendations             | P2       | Medium     | ⏳     |
| PDF Reports                             | P3       | High       | ⏳     |

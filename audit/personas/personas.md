# Personas

## 1. Erin “RIA” Carter — Registered Investment Advisor
- **Goals & constraints:** Maintain multiple client portfolios, prove performance vs. benchmarks, and deliver quarterly packets without exceeding compliance review time. Constrained by small team size and tight reporting deadlines.
- **Device & context:** Dual-monitor desktop in an advisory office; toggles dark mode for long analysis sessions. 【F:src/components/DashboardTab.jsx†L148-L198】
- **Financial literacy:** Expert; comfortable interpreting ROI metrics and blended benchmarks.
- **JTBD:** “When I close the books for a client, I need to compare their ROI vs. SPY and export holdings/transactions so that I can deliver audit-ready statements.”
- **Personal success metrics:** Ability to refresh ROI on demand, obtain CSV exports in minutes, and verify benchmark toggles stay aligned with client policy constraints.
- **Evidence pointers:**
  - README usage examples highlight deposits, dashboard checks, and CSV exports expected by advisors.【F:README.md†L147-L159】【F:README.md†L200-L210】
  - Reports tab surfaces export actions for transactions, holdings, and performance snapshots aligned with Erin’s workflow.【F:src/components/ReportsTab.jsx†L49-L100】
  - Dashboard ROI chart with benchmark controls lets her validate client-specific blends.【F:src/components/DashboardTab.jsx†L148-L198】【F:src/utils/roi.js†L1-L38】

## 2. Marcus “DIY” Nguyen — Active Individual Investor
- **Goals & constraints:** Track personal trades across devices, quickly add buys/sells, and understand cash drag without running spreadsheets. Constrained by limited evening time and no back-office support.
- **Device & context:** Laptop and tablet while commuting; expects responsive UI for the Transactions tab and dashboard metrics.【F:src/components/TransactionsTab.jsx†L439-L575】
- **Financial literacy:** Advanced retail investor familiar with order types and cost basis but not with institutional tooling.
- **JTBD:** “When I log a new trade, I want my holdings and ROI vs. SPY to update immediately so I can judge whether to rebalance.”
- **Personal success metrics:** Smooth transaction entry (with undo), clear cash balance feedback, and responsive ROI refreshes.
- **Evidence pointers:**
  - Transactions tab implements virtualised history, undo, and pagination to handle Marcus’s high trade count.【F:README.md†L185-L197】【F:src/components/TransactionsTab.jsx†L200-L310】
  - Holdings tab derives allocation metrics and signals Marcus tunes per ticker.【F:src/components/HoldingsTab.jsx†L34-L155】
  - ROI fetch and fallback logic determine how quickly his dashboard responds after edits.【F:src/App.jsx†L158-L205】【F:src/utils/roi.js†L104-L175】

## 3. Priya “Compliance” Desai — Portfolio Compliance & Security Lead
- **Goals & constraints:** Enforce API key hygiene, monitor rate limits, and audit security events to satisfy regulators. Operates under strict evidence requirements and must document every key rotation.
- **Device & context:** Corporate laptop on a secured network; frequently cross-references Admin tab with backend logs.【F:src/components/AdminTab.jsx†L410-L558】
- **Financial literacy:** High; focuses on policy adherence rather than day-to-day trading.
- **JTBD:** “When reviewing access policies, I need to verify API key strength, confirm rotations, and capture security events so regulators see a compliant history.”
- **Personal success metrics:** All portfolios use strong keys, lockouts are documented, and audit exports reference request IDs.
- **Evidence pointers:**
  - README and security guide specify key strength, rotation, and audit expectations she must enforce.【F:README.md†L91-L146】【F:docs/SECURITY.md†L11-L77】
  - Admin tab surfaces lockouts, rate limit scopes, and request IDs that Priya monitors daily.【F:src/components/AdminTab.jsx†L410-L558】
  - Integration tests prove key rotation and brute-force handling she relies on for compliance sign-off.【F:server/__tests__/integration.test.js†L61-L190】

## 4. Sofia “Ops” Ramirez — Operations Engineer / SRE
- **Goals & constraints:** Ensure nightly cash/benchmark jobs succeed, detect stale price feeds, and keep monitoring dashboards green. Works within on-call rotations and limited maintenance windows.
- **Device & context:** Uses terminal + dashboard on a laptop during overnight shifts; cross-checks CLI jobs with Admin metrics.【F:server/jobs/daily_close.js†L103-L200】【F:src/components/AdminTab.jsx†L364-L465】
- **Financial literacy:** High-level understanding of NAV, returns, and interest accrual; focuses on system health.
- **JTBD:** “When I’m on-call, I need immediate visibility into daily close results and cache freshness so I can respond before traders notice discrepancies.”
- **Personal success metrics:** Nightly close runs without manual retries, Admin tab highlights stale prices, and no surprise 503 responses from freshness guards.
- **Evidence pointers:**
  - Cash & benchmark doc explains nightly accrual pipeline and freshness guard Sofia must keep running.【F:docs/cash-benchmarks.md†L1-L120】
  - Daily close job composes interest accrual, price fetches, and return rows she monitors for failures.【F:server/jobs/daily_close.js†L103-L200】
  - Frontend operations playbook mandates Admin tab polling and KPI verification during her shift.【F:docs/frontend-operations.md†L30-L95】

## 5. Jamal “Quant” Lee — Automation & Data Engineering Lead
- **Goals & constraints:** Integrate REST endpoints with internal analytics, maintain data fidelity, and script imports/exports for research notebooks. Operates under time pressure during market hours.
- **Device & context:** Linux workstation; orchestrates scripts hitting `/api/v1/*` and consumes CSV outputs for modelling.【F:docs/openapi.yaml†L620-L686】【F:src/utils/api.js†L3-L288】
- **Financial literacy:** Expert; comfortable with TWR, ex-cash sleeves, and SPY benchmarks.
- **JTBD:** “When I sync the portfolio API with our analytics pipeline, I need consistent schema, strong error metadata, and exports that include all benchmark series.”
- **Personal success metrics:** Stable OpenAPI contract, descriptive API errors with request IDs, and CSV exports that feed quant models without manual cleanup.
- **Evidence pointers:**
  - OpenAPI spec documents the portfolio, returns, and benchmark endpoints Jamal integrates with.【F:docs/openapi.yaml†L620-L686】
  - Client API helpers expose versioned routing, error metadata, and header handling his scripts reuse.【F:src/utils/api.js†L3-L288】
  - README’s automation section shows curl workflows he extends into production jobs.【F:README.md†L161-L183】

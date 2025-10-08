<!-- markdownlint-disable -->
# Portfolio Manager (Server Edition)

This project provides a full‑stack portfolio manager that runs client‑side in the browser but persists data on the server. It allows you to record transactions (buy, sell, dividends, deposits and withdrawals) using amounts and exact prices, computes holdings and portfolio value, tracks return on investment (ROI) relative to the S&P 500 (SPY) and displays configurable trading signals for each ticker.

## Project status

- Phase 3 observability deliverables—request ID propagation, monitoring endpoints, and the Admin
  dashboard—are live on `main` (see `OBS-1` through `OBS-3` plus CODE/PERF items in
  [docs/HARDENING_SCOREBOARD.md](docs/HARDENING_SCOREBOARD.md)).
- Phase 4 focuses on frontend UX updates. Track backlog items `P4-UI-1`, `P4-UI-2`, and `P4-DOC-1`
  in the scoreboard before beginning new UI work. The accompanying
  [Frontend Operations Playbook](docs/frontend-operations.md) documents how to operate the
  refreshed Admin tab, benchmark toggles, and KPI workflows after each deploy.

## Getting Started

Content adapted from Section 6 ("Complete User Guide") of `comprehensive_audit_v3.md` so new contributors can follow a single source of truth.

### Prerequisites

- **Node.js** 20.x or later
- **npm** 9.x or later
- **Git** for cloning the repository
- **A text editor** (VS Code recommended)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/cortega26/portfolio-manager-server.git
   cd portfolio-manager-server
   ```
2. **Install dependencies**
   ```bash
   npm install
   ```
   This installs the shared toolchain for both the Express backend and the Vite frontend.
3. **Copy the environment template**
   ```bash
   cp .env.example .env
   ```
4. **Edit `.env`** with values suited to your machine (see the next section for guidance).

### Environment configuration

The template groups settings by concern; adjust at minimum:

- `NODE_ENV` / `PORT` – runtime mode and API port (defaults to `development`/`3000`).
- `DATA_DIR` – filesystem path where portfolios are persisted (defaults to `./data`).
- `CORS_ALLOWED_ORIGINS` – comma-separated list of frontends allowed to call the API.
- `FEATURES_CASH_BENCHMARKS` – keep `true` to expose cash and benchmark endpoints discussed below.
- `VITE_API_BASE` – override if the frontend should call a non-default API origin.
- `LOG_LEVEL` – adjust Pino verbosity (`trace`, `debug`, `info`, `warn`, `error`, `fatal`).
- `API_CACHE_TTL_SECONDS` / `PRICE_CACHE_TTL_SECONDS` / `PRICE_CACHE_CHECK_PERIOD` / `PRICE_FETCH_TIMEOUT_MS` – tune response caching, price cache maintenance, and upstream HTTP timeout behaviour.
- `BRUTE_FORCE_MAX_ATTEMPTS` / `BRUTE_FORCE_ATTEMPT_WINDOW_SECONDS` / `BRUTE_FORCE_LOCKOUT_SECONDS` / `BRUTE_FORCE_MAX_LOCKOUT_SECONDS` / `BRUTE_FORCE_LOCKOUT_MULTIPLIER` – configure the progressive lockout guard for portfolio authentication.
- `RATE_LIMIT_GENERAL_*` / `RATE_LIMIT_PORTFOLIO_*` / `RATE_LIMIT_PRICES_*` – adjust per-scope request limiting windows and max requests before a `429`.
- `SECURITY_AUDIT_MAX_EVENTS` – size of the in-memory audit buffer surfaced in the Admin dashboard.
- `JOB_NIGHTLY_HOUR` / `FRESHNESS_MAX_STALE_TRADING_DAYS` – govern when the nightly close runs and how long benchmark data may stay stale before returning `503`.

Refer back to Appendix B of the audit for the full catalog of supported variables.

### Start the application

Open two terminals from the project root:

**Terminal 1 – Backend API**
```bash
npm run server
```
You should see log lines such as `Server running on port 3000` and the resolved `data` directory.

**Terminal 2 – Frontend dev server**
```bash
npm run dev
```
Vite prints a local URL (normally `http://localhost:5173`) once it finishes bundling.

Visit `http://localhost:5173` in your browser to load the dashboard. The client proxies API requests to `http://localhost:3000` by default.

### Verify persistence

Create or load a portfolio, then confirm the backend wrote a file:

```bash
ls -la data/
```

Look for files named `portfolio_<id>.json`; they indicate the portfolio bootstrapped successfully.

## API Key Setup & Management

API keys secure every portfolio-specific request. Keys are hashed at rest, checked on each call, and required for both UI and API usage.

### Why API keys matter

- Enforce per-portfolio isolation so one compromised key cannot access other data.
- Support auditability—failed attempts are rate limited and logged.
- Enable rotation without downtime (old + new keys can be supplied together during a save).

### Crafting strong keys

Keys must satisfy the audit’s strengthened policy:

- Minimum 12 characters
- At least one uppercase letter (`A-Z`)
- At least one lowercase letter (`a-z`)
- At least one number (`0-9`)
- At least one special character (`!@#$%^&*`)

✅ **Examples that pass**
- `MyPortfolio2024!Secure`
- `Invest#2024$Growth`
- `Retirement@Plan2024`

❌ **Examples that fail**
- `password` (too short, lacks character classes)
- `12345678` (digits only)
- `portfoliokey` (no uppercase, numbers, or special characters)

If validation fails, the API responds with `400 WEAK_KEY` alongside the exact requirements to fix.

### Create your first portfolio

1. Pick a portfolio identifier that matches `[A-Za-z0-9_-]{1,64}` (for example `my-portfolio`).
2. Generate a strong API key using the rules above.
3. In the UI header, enter the portfolio ID, then the API key, and click **Save**.
4. The backend hashes and stores the key while creating `data/portfolio_<id>.json`.
5. Reload the dashboard or press **Load** to confirm the portfolio opens with the same credentials.

### Rotate API keys safely

1. Load the portfolio with the current key.
2. Prepare a new strong key.
3. Save the portfolio while providing both headers:
   ```bash
   curl -X POST http://localhost:3000/api/v1/portfolio/my-portfolio \
     -H "Content-Type: application/json" \
     -H "X-Portfolio-Key: OldKey2024!" \
     -H "X-Portfolio-Key-New: NewKey2024!" \
     -d @portfolio.json
   ```
4. Subsequent requests must send the new key; the old key is discarded after a successful rotation.

The UI exposes matching fields so non-CLI users can rotate keys without dropping connections.

## Usage Examples

### Day-one funding and purchases

1. Save an initial `DEPOSIT` of 10,000 USD on your start date.
2. Add `BUY` transactions for tickers such as `AAPL` or `MSFT` with negative cash amounts and market prices.
3. Switch to the **Dashboard** tab to confirm holdings, allocation weights, and blended benchmark comparisons.

### Monthly income tracking

1. Record recurring `DIVIDEND` entries whenever payouts arrive.
2. Use the **History** tab to monitor realised income and reinvest via new `BUY` transactions.
3. Export the **Transactions** report if you need a CSV for accounting.

### API automation

Use `curl` or Postman to script workflows:

```bash
# Fetch one year of prices
curl "http://localhost:3000/api/v1/prices/SPY?range=1y"

# Append a deposit followed by a buy
curl -X POST http://localhost:3000/api/v1/portfolio/my-portfolio \
  -H "Content-Type: application/json" \
  -H "X-Portfolio-Key: MyPortfolio2024!Secure" \
  -d '{
    "transactions": [
      { "date": "2024-01-01", "type": "DEPOSIT", "amount": 10000 },
      { "date": "2024-01-05", "ticker": "AAPL", "type": "BUY", "amount": -3000, "price": 150 }
    ]
  }'

# Retrieve daily returns including blended benchmarks
curl "http://localhost:3000/api/v1/returns/daily?from=2024-01-01&to=2024-12-31" \
  -H "X-Portfolio-Key: MyPortfolio2024!Secure"
```

### Handling large portfolios

- The **Transactions** tab renders via `react-window`, virtualising anything
  above ~200 rows. Scroll through 10 000+ items while only the visible subset is
  mounted, preserving the existing table semantics and Undo actions.
- Search input changes flow through a shared 300 ms debounce so rapid typing
  does not churn the virtualised list. When a filter narrows the results below
  the threshold the component automatically snaps back to paginated mode for
  quick comparisons.
- Tests in
  [`src/__tests__/Transactions.integration.test.jsx`](src/__tests__/Transactions.integration.test.jsx)
  exercise virtual scroll, filter resets, and the scroll-to-row behaviour—tune
  the debounce window or row height in lockstep with those assertions.

### Bulk CSV import

1. Prepare a CSV containing historical activity:
   ```csv
   date,ticker,type,amount,price
   2024-01-01,,DEPOSIT,10000,0
   2024-01-05,AAPL,BUY,-3000,150
   2024-01-05,MSFT,BUY,-3000,375
   2024-02-15,AAPL,DIVIDEND,50,0
   ```
2. Open **Reports → Import** in the UI and select the file.
3. Review the preview, confirm, and save the portfolio so the backend persists the new transactions.

## Troubleshooting

Common issues and quick fixes (see Section 6 of the audit for the full decision tree):

- **Cannot connect to backend** – Ensure `npm run server` is running, port 3000 is free, and `VITE_API_BASE` matches the API origin.
- **Portfolio not found** – Verify the ID spelling and confirm the `data/` directory contains `portfolio_<id>.json`.
- **Invalid API key / too many attempts** – Keys are case-sensitive; remove trailing spaces and wait 15 minutes if rate limited.
- **Prices not loading** – Check your network connection, confirm the ticker is a supported US symbol, and verify stooq.com is reachable.
- **Transactions not saving** – Inspect server logs for validation errors and confirm the process can write to `DATA_DIR`.
- **Unexpected calculations** – Re-check transaction dates, price signs, and run `npm test` to ensure formulas are intact.

If problems persist, gather relevant log lines (the server uses Pino for structured output) before opening an issue.

## API Versioning & Headers

All endpoints are now served under `/api/v1`. Legacy `/api` URLs still work but
emit a `Warning: 299` header encouraging migration and mark responses with
`X-API-Version: legacy`.

- Always call `/api/v1/*` from new clients—the same handlers run under the
  versioned prefix.
- Legacy `/api/*` requests are rewritten to those `/api` controllers before rate
  limiting, so endpoints such as `/api/v1/prices/*` and `/api/v1/cache/stats`
  respond identically while clients migrate.
- Provide an `X-Request-ID` header when available. The server echoes the value
  back (and generates one when omitted) so logs, clients, and monitoring tools
  can trace requests end to end.
- Client helpers in `src/utils/api.js` return an object with `{ data, requestId,
  version }` and accept an optional `onRequestMetadata` callback so dashboards
  (e.g. the Admin tab) can surface trace IDs without re-parsing `fetch`
  responses.

Example:

```bash
curl -H "X-Request-ID: demo-123" http://localhost:3000/api/v1/monitoring -i
```

## Monitoring & Diagnostics

Operational dashboards can poll the hardened metrics endpoints:

- `GET /api/v1/security/stats` – Per-scope rate limiter hits, rolling windows, and brute-force guard stats.
- `GET /api/v1/monitoring` – Process uptime/memory, cache hit ratios, and lock queue depth so you can alert on contention.

Both endpoints return JSON and are safe to proxy into Prometheus exporters or Grafana data sources.

Prefer a UI? The **Admin** tab in the frontend consumes the same endpoints plus the in-memory security
audit buffer to visualise active lockouts, top rate-limit offenders, and recent authentication events
without leaving the dashboard.

## Holdings utility hooks

When calling the client-side holdings helpers you can subscribe to structured warning events instead of watching for console output.

| name        | type                     | default | required | description |
|-------------|--------------------------|---------|----------|-------------|
| `logSummary`| `boolean`                | `true`  | No       | Emits a single `summary` warning after processing if any oversell events were detected. |
| `onWarning` | `(event: HoldingsEvent)` | `null`  | No       | Invoked for each warning. Receives `{ type: 'oversell' or 'summary', warning?, message?, count?, warnings? }`. |

The helpers never print to `console.warn`. To surface oversell conditions in the UI, pass an `onWarning` handler to `buildHoldingsState` or the ledger reducer and display the returned warning metadata in your preferred channel.

## Security Logging

The Express backend streams security-audit events through Pino. Every authentication request emits
structured envelopes such as `auth_success`, `auth_failed`, `key_rotated`, `weak_key_rejected`, and
`rate_limit_exceeded` with the following fields:

- `event_type` (always `security`) and `event`
- ISO `timestamp` plus `request_id`
- Network context (`ip`, `user_agent`)
- `portfolio_id` and contextual metadata (`reason`, `scope`, etc.)

For production deployments forward these logs to a central aggregator (Grafana Loki, Elastic, or
Datadog) using your log shipper of choice. Shipping on the `event_type=security` channel keeps audit
trails searchable and enables alerting for repeated failures or rate-limit violations.

📚 **Need the full runbook?** Read [docs/SECURITY.md](docs/SECURITY.md) for detailed incident
response procedures, API key management guidance, and a complete configuration reference covering
the brute-force guard, cache TTLs, and logging controls.

## Features

- **Server‑side persistence** – save and load your portfolio on any device via REST endpoints.
- **Tabbed workspace** – switch between Dashboard, Holdings, Transactions, History, Metrics, Reports, and Settings views without losing context.
- **Transaction entry** – enter date, ticker, transaction type, and amount; price is only required for Buy/Sell orders and shares are calculated automatically.
- **Holdings dashboard** – see average cost, current value, unrealised/realised PnL, ROI and position weights.
- **Signals per ticker** – define a percentage band around the last price to trigger buy/trim/hold signals.
- **ROI vs SPY** – chart your portfolio’s performance against SPY using daily price data from Stooq (no API key required).
- **Client-side schema validation** – the React client runs zod checks before POSTing to the portfolio API so only well-formed payloads reach the server.
- **Cash & benchmark analytics** – when `FEATURES_CASH_BENCHMARKS` is enabled the server accrues daily cash interest, snapshots NAV, and exposes blended benchmark series plus admin cash-rate management.
- **Deterministic math engine** – internal cash, holdings, and return calculations run in Decimal/cents space; see [docs/math-policy.md](docs/math-policy.md).
- **Responsive, dark mode UI** built with React, Tailwind CSS and Recharts.
- **Virtualised transaction table** – filter and scroll through 10 000+ records with a debounced search and `react-window`.
- **Admin dashboard** – surface runtime metrics, rate-limit offenders, and recent security audit events in one place.

## Phase 1 Audit Fixes (October 2025)

### Applied Fixes

This codebase has been updated with critical fixes from a comprehensive audit:

#### Transaction Processing
- ✅ **CRITICAL-1:** Share calculation now uses consistent sign conventions
- ✅ **CRITICAL-3:** Sell transactions are validated and clipped to prevent negative shares
- ✅ **CRITICAL-8:** Same-day transactions are processed in deterministic order (DEPOSIT → BUY → SELL → WITHDRAWAL)
- ✅ **HIGH-2:** Price validation ensures only positive prices are accepted

#### Return Calculations
- ✅ **CRITICAL-5:** First-day Time-Weighted Returns are now calculated correctly
- ✅ **CRITICAL-6:** Blended benchmark uses start-of-period weights (not end-of-period)

### Testing & quality gates

For Phase 5 UI hardening we rely on a streamlined Vitest setup that targets the React components exercised in `src/__tests__/**/*.test.tsx`.

- `npm run lint` – ESLint with `--max-warnings=0` across the repo.
- `npm run test:fast` – Vitest in jsdom mode without coverage for quick iteration.
- `npm run test:coverage` – Vitest + `@vitest/coverage-v8` (text-summary + lcov) with offline guards and console noise enforcement via `src/setupTests.ts`. Latest run drives `src/components/HoldingsTab.jsx` to **166/168** lines (**98.8 %**) and **28/33** branches (**84.8 %**), covering the new signal configuration cases end-to-end.
- `npm run test:perf` – Synthetic 12k-transaction ledger processed through the holdings builder; fails if runtime exceeds **1 000 ms** or the NAV series is inconsistent. Structured JSON logs emit duration, heap delta, and NAV samples for CI dashboards.
- `npm run test:e2e` – Playwright smoke flow exercising portfolio authentication, dashboard KPIs, and benchmark toggles in headless Chromium. Requires `npx playwright install --with-deps chromium` once per environment; artefacts land in `playwright-report/` (HTML + trace) and `test-results/e2e-junit.xml` (JUnit) for CI ingestion.

Sample output (newline-delimited JSON for log aggregation):

```json
{"ts":"2025-10-08T06:17:07.657Z","level":"info","event":"perf_metric","metric":"holdings_builder_duration","transactionCount":12289,"dateCount":3073,"thresholdMs":1000,"durationMs":212.59,"heapDeltaMb":-4.172,"navSample":1504363.75}
```
- `npm run build` – Production build through Vite.

The shared test harness automatically opts into the React Router v7 transition behaviour, restores console spies between tests, and sets `process.env.NO_NETWORK_TESTS = '1'` to guarantee offline execution. Tests should stub API layers (`src/utils/api.js`) or other network clients explicitly.

The Playwright configuration (`playwright.config.ts`) starts Vite on port **4173** with `NO_NETWORK_TESTS=1` and `VITE_API_BASE=http://127.0.0.1:9999`, then intercepts API calls inside the tests for deterministic fixtures. Traces, screenshots, and videos are captured on failures, and the HTML report is viewable via `npx playwright show-report`.

| Name               | Type   | Default | Required | Description |
| ------------------ | ------ | ------- | -------- | ----------- |
| `NO_NETWORK_TESTS` | string | `'1'`   | No       | Forces component tests to remain offline; mock fetchers/HTTP clients instead of performing live calls. |

## Continuous Integration

GitHub Actions enforces quality gates on every push and pull request targeting `main`. The reusable CI workflow runs before any Pages deployment and must succeed before the release workflow can proceed.

| Workflow | Job | Purpose | Key commands | Artifacts |
| -------- | --- | ------- | ------------ | --------- |
| `CI` | `ci` | Installs dependencies, lints, runs the Node test runner twice (directly and through `nyc`) and enforces coverage/security/audit gates. | `npm ci`, `npm run lint`, `npm run test`, `npx nyc check-coverage --branches=85 --functions=85 --lines=85 --statements=85`, `npx gitleaks detect --no-banner`, `npm audit --audit-level=moderate` | `coverage/` uploaded as the `node-coverage` artifact |
| `CI` (planned) | `e2e-smoke` | Launch Vite headlessly and execute Playwright smoke flows with mocked API responses. | `npm ci`, `npx playwright install --with-deps chromium`, `npm run test:e2e` | `playwright-report/`, `test-results/e2e-junit.xml` |
| `Deploy Vite app to GitHub Pages` | `build-and-deploy` | Builds and publishes the static frontend once CI succeeds on `main`. | `npm install`, `npm run build` | `dist/` via `actions/upload-pages-artifact` |

#### Proposed GitHub Actions steps

```yaml
    - name: Install Playwright browsers (Chromium only)
      run: npx playwright install --with-deps chromium
    - name: Run Playwright smoke tests
      env:
        NO_NETWORK_TESTS: "1"
        VITE_API_BASE: http://127.0.0.1:9999
      run: npm run test:e2e
    - name: Upload Playwright report
      if: always()
      uses: actions/upload-artifact@v4
      with:
        name: e2e-playwright-report
        path: |
          playwright-report
          test-results/e2e-junit.xml
```

> The repository bundles a deterministic `gitleaks` wrapper under `tools/gitleaks/` so that secret scanning works without downloading third-party binaries. The scanner audits for high-signal patterns (AWS/GitHub/Slack/Google tokens and private-key blocks) and fails the build if any are discovered.

### Known Limitations

**These are planned for future phases:**

- **Lot Tracking (Phase 2):** Current implementation uses average cost basis. For accurate tax reporting, lot-level tracking (FIFO/LIFO) will be implemented in Phase 2.
- **Trading Day Calendar (Phase 3):** Price staleness detection uses calendar days. Trading day awareness will be added in Phase 3.
- **Daily Compound Interest:** Cash interest is calculated using daily compound. Documentation has been updated to reflect this (not "simple monthly" as previously stated).

### Migration Notes

**For existing portfolios:**

1. Transaction ordering may slightly change due to deterministic type-based sorting
2. First-day returns may show non-zero values where they were previously 0%
3. Oversell attempts will now be clipped to available shares with warnings in console

These changes improve data integrity and mathematical correctness.

### Frontend configuration

| Name            | Type         | Default                                            | Required | Description                                                                   |
| --------------- | ------------ | -------------------------------------------------- | -------- | ----------------------------------------------------------------------------- |
| `VITE_API_BASE` | string (URL) | `https://portfolio-api.carlosortega77.workers.dev` | No       | Overrides the API host used by the Dashboard, Holdings and Transactions tabs. |

### Tabbed navigation

The interface organises the experience across focused tabs:

- **Dashboard** – portfolio KPIs, cash allocation, ROI comparisons with benchmark toggles (SPY, blended, ex-cash, cash), and quick actions to refresh analytics or open reference material.
- **Holdings** – consolidated holdings table plus configurable buy/trim signal bands for each ticker.
- **Transactions** – dedicated form for capturing trades and a chronological activity table.
- **History** – contribution trends and a chronological timeline of activity, grouped by calendar month.
- **Metrics** – allocation concentration, return ratios, and performance highlights derived from the ROI series.
- **Reports** – CSV export hub covering transactions, holdings, and ROI comparisons for downstream analysis.
- **Settings** – privacy, notification, and display preferences persisted to the browser for future sessions.
- **Admin** – inspect runtime metrics, lockout activity, and security audit trails without leaving the app.

## Getting Started

### Development

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Start the backend:**

   ```bash
   npm run server
   ```

   The server validates portfolio identifiers to the pattern `[A-Za-z0-9_-]{1,64}` to prevent path traversal. Requests with invalid identifiers return `400`.

   Configuration is provided via environment variables:

| Name                     | Type          | Default  | Required | Description                                         |
| ------------------------ | ------------- | -------- | -------- | --------------------------------------------------- |
| `PORT`                   | number        | `3000`   | No       | TCP port for the Express server.                    |
| `DATA_DIR`               | string (path) | `./data` | No       | Directory for persisted portfolio files and JSON tables. |
| `PRICE_FETCH_TIMEOUT_MS` | number        | `5000`   | No       | Timeout in milliseconds for legacy upstream price fetches. |
| `API_CACHE_TTL_SECONDS`  | number        | `600`    | No       | In-process cache TTL (seconds) for price and analytics endpoints; defaults within the 300–900 s range. |
| `FEATURES_CASH_BENCHMARKS` | boolean     | `true`   | No       | Enables cash accrual, NAV/return endpoints, and nightly job. |
| `JOB_NIGHTLY_HOUR`       | number        | `4`      | No       | UTC hour to execute the nightly close pipeline.     |
| `CORS_ALLOWED_ORIGINS`   | string (CSV)  | _(empty)_ | No      | Comma-separated origins allowed by the API CORS policy. |

Price data for interactive queries is fetched from [Stooq](https://stooq.com/). Benchmark processing uses the Yahoo Finance adjusted-close feed via the provider interface documented in [`docs/cash-benchmarks.md`](docs/cash-benchmarks.md).

#### Benchmark toggles & ROI comparisons

The Dashboard ROI chart now consumes `/api/returns/daily` and `/api/benchmarks/summary` to layer 100% SPY, blended, risk-sleeve (ex-cash), and cash yield series alongside the portfolio. Users can toggle any combination of benchmarks, reset to the recommended comparison with a dedicated control, and the selection is saved to browser storage so the chart opens with the same comparison after refresh or sign-in. Each toggle is keyboard accessible, labelled for assistive tech, and mirrors the colors used in the legend for clarity. The reset button is disabled while the default blend is active so keyboard/screen-reader users receive clear affordances about state.

#### KPI panel for cash & benchmarks

The dashboard KPI panel blends ledger balances with the benchmark snapshot documented in [`docs/cash-benchmarks.md`](docs/cash-benchmarks.md):

- **Net Asset Value** – total risk assets plus cash, with the description surfacing the current cash balance tracked by the ledger.
- **Total Return** – realised + unrealised P&L alongside the cumulative ROI in percentage points.
- **Invested Capital** – capital deployed into positions with a quick count of tracked holdings and their combined risk-asset value.
- **Cash Allocation** – start-of-day cash weight (cash ÷ NAV) rounded to one decimal place per the benchmark spec.
- **Cash Drag** – difference between the 100% SPY track and the blended benchmark, highlighting the opportunity cost of idle cash.
- **Benchmark Delta** – side-by-side ROI deltas versus SPY and the blended sleeve so deviations stand out without opening the full chart.

Each card keeps the prior responsive layout (two columns on small screens, three on large, expanding to six cards on wide displays) and inherits dark-mode styling so the refreshed metrics remain legible in both themes.

3. **Start the frontend:**

   ```bash
   npm run dev
   ```

   Vite runs on port `5173` and proxies `/api` calls to the backend.

4. **Usage:**
   - Navigate using the tab bar at the top of the workspace. The active tab is persisted while you save or load data.
  - Add transactions via the **Transactions** tab. Enter **amount** (and **price** for Buy/Sell orders); the form hides the price field for cash-only events and computes shares automatically when needed.
  - Scroll-free pagination keeps transaction tables responsive — 50 rows per page by default with controls to change the page size or step through history.
   - Review metrics, ROI performance, cash allocation, and benchmark deltas from the **Dashboard** tab.
   - Configure signals and monitor allocation details from the **Holdings** tab. Percentage windows determine when the last price falls below or above your buy/trim zones.
   - Audit deposits, withdrawals, and realised cash flow via the **History** tab’s contribution trends and timeline.
   - Inspect diversification, return ratios, and ROI highlights through the **Metrics** tab.
   - Export ledger, holdings, and ROI data from the **Reports** tab for compliance or reporting workflows.
   - Adjust notification, privacy, and workspace preferences from the **Settings** tab; values persist locally.
   - Save or load your portfolio by choosing a portfolio ID and pressing **Save** or **Load**. Portfolios are stored in the backend’s `data/` folder.

### Production Deployment

To deploy the static frontend to GitHub Pages and run the backend separately:

1. Build the frontend:

   ```bash
   npm run build
   ```

2. Serve the files in `dist/` from your static host (GitHub Pages, Netlify, etc.). If using GitHub Pages, set the `base` path in `vite.config.js` or define `VITE_BASE=/your-repo/` at build time.

3. Deploy the backend to your preferred host (Heroku, Railway, Cloudflare Workers with minimal adjustments). For Cloudflare Workers, you can port the express logic to `fetch` handlers and use KV for storage.

## Frontend operations workflow

Operate the Phase 4 dashboard enhancements using the dedicated
[Frontend Operations Playbook](docs/frontend-operations.md). Key expectations:

- **Admin tab monitoring:** Follow the playbook’s polling guidance for the security events stream, rate-limit gauges, and benchmark health widget. Correlate anomalies with `/api/monitoring` responses captured in the Admin tab.
- **Benchmark toggles:** Run the smoke checklist to validate SPY, blended, ex-cash, and cash series after every deploy. Persisted selections should survive reloads; regressions trigger the incident response steps outlined in the playbook.
- **KPI refresh verification:** Confirm cash allocation, drag, and benchmark deltas match backend summary data. Tooltips reference `docs/cash-benchmarks.md` terminology—report deviations in the release ticket.
- **Incident response:** On-call engineers use the rollback plan and feature-flag overrides described in the playbook within 15 minutes of detecting a regression. Update `docs/HARDENING_SCOREBOARD.md` Phase 4 entries with the deploy evidence noted in the playbook.

### HTTPS & transport security

Always terminate traffic for the Express API behind HTTPS with HTTP Strict Transport Security (HSTS) enabled at your edge proxy or load balancer. Plaintext HTTP must never be exposed in production—enforce automatic redirects to HTTPS and configure long-lived HSTS policies for continued protection.

## API

### Authentication

Every request that reads from or writes to `/api/v1/portfolio/:id` must include an `X-Portfolio-Key` header. On the first `POST` the server bootstraps the portfolio by hashing and storing the provided key. Subsequent requests must reuse the same header value; requests without it return `401 NO_KEY` and mismatched keys return `403 INVALID_KEY`. To rotate credentials atomically, include the current key plus `X-Portfolio-Key-New` with the replacement value on a `POST` request. Keys are stored as SHA-256 hashes and never returned in responses. New or rotated keys must be at least 12 characters and include uppercase, lowercase, numeric, and special characters—weak keys return `400 WEAK_KEY`. Repeated missing or invalid keys are tracked per portfolio and remote address—after five failures within fifteen minutes the API responds with `429 TOO_MANY_KEY_ATTEMPTS` and a `Retry-After` header; presenting the correct key immediately clears the lockout.

### `GET /api/v1/prices/:symbol?range=1y`

Returns an array of historical prices for a US ticker using Stooq. Supported query parameters:

- `range` – currently only `1y` (one year of daily data) is supported.

Responses include `ETag` headers, `X-Cache: HIT|MISS`, and `Cache-Control: private, max-age=<PRICE_CACHE_TTL_SECONDS>` allowing conditional requests. Repeat calls with a matching `If-None-Match` header receive HTTP `304` without re-fetching upstream data.

Example response:

```json
[
  { "date": "2024-10-01", "close": 178.59 },
  { "date": "2024-10-02", "close": 179.38 },
  …
]
```

### `GET /api/cache/stats`

Returns aggregated cache metrics (`keys`, `hits`, `misses`, `hitRate`) for price data caching. Useful for lightweight monitoring or local performance verification.

### `GET /api/v1/security/stats`

Returns aggregated security metrics for the brute-force guard and rate limiter instrumentation. The payload includes:

- `bruteForce` – existing lockout counters and configuration thresholds.
- `rateLimit` – global limiter hit totals plus per-scope breakdowns (`general`, `portfolio`, `prices`). Each scope reports
  `limit`, `windowMs`, `totalHits`, rolling hit counters (`hitsLastMinute`, `hitsLastWindow`, `hitsLast15m`), the number of
  unique offending IPs observed in the last 15 minutes, the most recent hit timestamp, and up to five recent offenders with hit
  counts.

Example response excerpt:

```json
{
  "bruteForce": {
    "activeLockouts": 0,
    "config": { "maxAttempts": 5, "attemptWindowSeconds": 900 }
  },
  "rateLimit": {
    "totalHits": 3,
    "scopes": {
      "portfolio": {
        "limit": 20,
        "windowMs": 60000,
        "totalHits": 2,
        "hitsLastMinute": 1,
        "hitsLastWindow": 2,
        "hitsLast15m": 2,
        "uniqueIpCount": 1,
        "lastHitAt": "2025-10-07T05:15:30.123Z",
        "topOffenders": [
          { "ip": "127.0.0.1", "hits": 2, "lastHitAt": "2025-10-07T05:15:30.123Z" }
        ]
      }
    }
  }
}
```

### `GET /api/v1/portfolio/:id`

Loads a saved portfolio with the given `id` from the `data` folder once it has been provisioned. The identifier must match `[A-Za-z0-9_-]{1,64}`; otherwise the request is rejected with HTTP `400`. Portfolios that are not yet provisioned respond with HTTP `404 PORTFOLIO_NOT_FOUND`.

### `POST /api/v1/portfolio/:id`

Saves a portfolio to the backend. Bodies are validated against the schema in [`server/middleware/validation.js`](server/middleware/validation.js):

- `transactions` must be an array of transaction objects (`date`, `ticker`, `type`, `amount`, optional `quantity`/`shares`, etc.).
- Optional `signals` map tickers to `{ pct: number }` windows.
- Optional `settings.autoClip` flag controls oversell behaviour. By default oversells are rejected with `400 E_OVERSELL`; when the flag is `true` the server clips the sell order to the available shares and records an audit trail entry in `transaction.metadata.system.oversell_clipped`.

The identifier is validated using the same `[A-Za-z0-9_-]{1,64}` rule. Invalid identifiers or payloads yield HTTP `400` with `{ error: "VALIDATION_ERROR", details: [...] }`. Valid portfolios are stored as `data/portfolio_<id>.json`.

### Cash & benchmark endpoints

When the `features.cash_benchmarks` flag is active the API also exposes:

- `GET /api/v1/returns/daily?from=YYYY-MM-DD&to=YYYY-MM-DD&views=port,excash,spy,bench&page=1&per_page=100`
- `GET /api/v1/nav/daily?from=YYYY-MM-DD&to=YYYY-MM-DD&page=1&per_page=100` (includes `stale_price` flag)
- `GET /api/benchmarks/summary?from=YYYY-MM-DD&to=YYYY-MM-DD`
  - Response includes `money_weighted.portfolio` (annualised XIRR) with `start_date`, `end_date`, and `method` fields describing the solved window.
- `POST /api/admin/cash-rate` accepting `{ "effective_date": "YYYY-MM-DD", "apy": 0.04 }`

List endpoints support `page`/`per_page` pagination (defaults: page 1, `per_page` 100) and return an additional `meta` block plus `ETag` headers for conditional requests. They also emit `Cache-Control: private, max-age=<API_CACHE_TTL_SECONDS>` to align browser caches with the server’s in-process TTL.

Refer to [`docs/openapi.yaml`](docs/openapi.yaml) for detailed schemas and sample responses.

### Nightly job & backfill CLI

- The Express entry point schedules `runDailyClose` once per UTC day according to `JOB_NIGHTLY_HOUR`. The job accrues cash interest, refreshes adjusted-close prices (SPY + held tickers), rebuilds NAV snapshots, and stores daily return rows.
- Historical recomputations can be triggered manually:

  ```bash
  npm run backfill -- --from=2024-01-01 --to=2024-01-31
  ```

  The command is idempotent and safe to rerun; it reuses the same price provider infrastructure as the nightly pipeline.

## Contributing

Feel free to fork this repository and customise it to your needs. Pull requests are welcome!

<!-- markdownlint-disable -->
# Portfolio Manager (Server Edition)

This project provides a full‑stack portfolio manager that runs client‑side in the browser but persists data on the server. It allows you to record transactions (buy, sell, dividends, deposits and withdrawals) using amounts and exact prices, computes holdings and portfolio value, tracks return on investment (ROI) relative to the S&P 500 (SPY) and displays configurable trading signals for each ticker.

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
- `API_CACHE_TTL_SECONDS` / `PRICE_FETCH_TIMEOUT_MS` – tune caching and upstream HTTP timeout behaviour.
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
   curl -X POST http://localhost:3000/api/portfolio/my-portfolio \
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
curl "http://localhost:3000/api/prices/SPY?range=1y"

# Append a deposit followed by a buy
curl -X POST http://localhost:3000/api/portfolio/my-portfolio \
  -H "Content-Type: application/json" \
  -H "X-Portfolio-Key: MyPortfolio2024!Secure" \
  -d '{
    "transactions": [
      { "date": "2024-01-01", "type": "DEPOSIT", "amount": 10000 },
      { "date": "2024-01-05", "ticker": "AAPL", "type": "BUY", "amount": -3000, "price": 150 }
    ]
  }'

# Retrieve daily returns including blended benchmarks
curl "http://localhost:3000/api/returns/daily?from=2024-01-01&to=2024-12-31" \
  -H "X-Portfolio-Key: MyPortfolio2024!Secure"
```

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

## Features

- **Server‑side persistence** – save and load your portfolio on any device via REST endpoints.
- **Tabbed workspace** – switch between Dashboard, Holdings, Transactions, History, Metrics, Reports, and Settings views without losing context.
- **Transaction entry** – enter date, ticker, transaction type, amount invested and price; the app calculates shares automatically.
- **Holdings dashboard** – see average cost, current value, unrealised/realised PnL, ROI and position weights.
- **Signals per ticker** – define a percentage band around the last price to trigger buy/trim/hold signals.
- **ROI vs SPY** – chart your portfolio’s performance against SPY using daily price data from Stooq (no API key required).
- **Client-side schema validation** – the React client runs zod checks before POSTing to the portfolio API so only well-formed payloads reach the server.
- **Cash & benchmark analytics** – when `FEATURES_CASH_BENCHMARKS` is enabled the server accrues daily cash interest, snapshots NAV, and exposes blended benchmark series plus admin cash-rate management.
- **Deterministic math engine** – internal cash, holdings, and return calculations run in Decimal/cents space; see [docs/math-policy.md](docs/math-policy.md).
- **Responsive, dark mode UI** built with React, Tailwind CSS and Recharts.

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

### Testing

Run the test suite to verify all fixes:

```bash
npm test
```

The suite includes OpenAPI contract coverage via `server/__tests__/api_contract.test.js`,
which loads [`docs/openapi.yaml`](docs/openapi.yaml) with `@apidevtools/swagger-parser` and
validates the JSON returned by SuperTest requests against the documented schemas. The new
`src/__tests__/portfolioSchema.test.js` exercises the client zod validator, keeping the browser and
the Express schema in sync. A dedicated `server/__tests__/integration.test.js` now drives a full
portfolio lifecycle (bootstrap → trades → key rotation) and verifies the API key lockout rules,
while `server/__tests__/edge_cases.test.js` codifies same-day ordering, oversell rejection,
precision math, and validation edge cases. API failure paths are captured in
`server/__tests__/api_errors.test.js`, ensuring malformed payloads, weak keys, and oversized bodies
surface the documented error codes. All Phase 1 critical tests should pass.

## Continuous Integration

GitHub Actions enforces quality gates on every push and pull request targeting `main`. The reusable CI workflow runs before any Pages deployment and must succeed before the release workflow can proceed.

| Workflow | Job | Purpose | Key commands | Artifacts |
| -------- | --- | ------- | ------------ | --------- |
| `CI` | `ci` | Installs dependencies, lints, runs the Node test runner twice (directly and through `nyc`) and enforces coverage/security/audit gates. | `npm ci`, `npm run lint`, `npm run test`, `npx nyc check-coverage --branches=85 --functions=85 --lines=85 --statements=85`, `npx gitleaks detect --no-banner`, `npm audit --audit-level=moderate` | `coverage/` uploaded as the `node-coverage` artifact |
| `Deploy Vite app to GitHub Pages` | `build-and-deploy` | Builds and publishes the static frontend once CI succeeds on `main`. | `npm install`, `npm run build` | `dist/` via `actions/upload-pages-artifact` |

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

- **Dashboard** – portfolio KPIs, ROI vs. SPY line chart, and quick actions to refresh analytics or open reference material.
- **Holdings** – consolidated holdings table plus configurable buy/trim signal bands for each ticker.
- **Transactions** – dedicated form for capturing trades and a chronological activity table.
- **History** – contribution trends and a chronological timeline of activity, grouped by calendar month.
- **Metrics** – allocation concentration, return ratios, and performance highlights derived from the ROI series.
- **Reports** – CSV export hub covering transactions, holdings, and ROI comparisons for downstream analysis.
- **Settings** – privacy, notification, and display preferences persisted to the browser for future sessions.

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

3. **Start the frontend:**

   ```bash
   npm run dev
   ```

   Vite runs on port `5173` and proxies `/api` calls to the backend.

4. **Usage:**
   - Navigate using the tab bar at the top of the workspace. The active tab is persisted while you save or load data.
   - Add transactions via the **Transactions** tab. Enter **amount** and **price**; shares are computed automatically before submission.
   - Review metrics, ROI performance and quick actions from the **Dashboard** tab.
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

### HTTPS & transport security

Always terminate traffic for the Express API behind HTTPS with HTTP Strict Transport Security (HSTS) enabled at your edge proxy or load balancer. Plaintext HTTP must never be exposed in production—enforce automatic redirects to HTTPS and configure long-lived HSTS policies for continued protection.

## API

### Authentication

Every request that reads from or writes to `/api/portfolio/:id` must include an `X-Portfolio-Key` header. On the first `POST` the server bootstraps the portfolio by hashing and storing the provided key. Subsequent requests must reuse the same header value; requests without it return `401 NO_KEY` and mismatched keys return `403 INVALID_KEY`. To rotate credentials atomically, include the current key plus `X-Portfolio-Key-New` with the replacement value on a `POST` request. Keys are stored as SHA-256 hashes and never returned in responses. New or rotated keys must be at least 12 characters and include uppercase, lowercase, numeric, and special characters—weak keys return `400 WEAK_KEY`. Repeated missing or invalid keys are tracked per portfolio and remote address—after five failures within fifteen minutes the API responds with `429 TOO_MANY_KEY_ATTEMPTS` and a `Retry-After` header; presenting the correct key immediately clears the lockout.

### `GET /api/prices/:symbol?range=1y`

Returns an array of historical prices for a US ticker using Stooq. Supported query parameters:

- `range` – currently only `1y` (one year of daily data) is supported.

Responses include `ETag` headers and `Cache-Control: private, max-age=<API_CACHE_TTL_SECONDS>` allowing conditional requests. Repeat calls with a matching `If-None-Match` header receive HTTP `304` without re-fetching upstream data.

Example response:

```json
[
  { "date": "2024-10-01", "close": 178.59 },
  { "date": "2024-10-02", "close": 179.38 },
  …
]
```

### `GET /api/portfolio/:id`

Loads a saved portfolio with the given `id` from the `data` folder once it has been provisioned. The identifier must match `[A-Za-z0-9_-]{1,64}`; otherwise the request is rejected with HTTP `400`. Portfolios that are not yet provisioned respond with HTTP `404 PORTFOLIO_NOT_FOUND`.

### `POST /api/portfolio/:id`

Saves a portfolio to the backend. Bodies are validated against the schema in [`server/middleware/validation.js`](server/middleware/validation.js):

- `transactions` must be an array of transaction objects (`date`, `ticker`, `type`, `amount`, optional `quantity`/`shares`, etc.).
- Optional `signals` map tickers to `{ pct: number }` windows.
- Optional `settings.autoClip` flag controls oversell behaviour. By default oversells are rejected with `400 E_OVERSELL`; when the flag is `true` the server clips the sell order to the available shares and records an audit trail entry in `transaction.metadata.system.oversell_clipped`.

The identifier is validated using the same `[A-Za-z0-9_-]{1,64}` rule. Invalid identifiers or payloads yield HTTP `400` with `{ error: "VALIDATION_ERROR", details: [...] }`. Valid portfolios are stored as `data/portfolio_<id>.json`.

### Cash & benchmark endpoints

When the `features.cash_benchmarks` flag is active the API also exposes:

- `GET /api/returns/daily?from=YYYY-MM-DD&to=YYYY-MM-DD&views=port,excash,spy,bench&page=1&per_page=100`
- `GET /api/nav/daily?from=YYYY-MM-DD&to=YYYY-MM-DD&page=1&per_page=100` (includes `stale_price` flag)
- `GET /api/benchmarks/summary?from=YYYY-MM-DD&to=YYYY-MM-DD`
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

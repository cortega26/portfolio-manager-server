# Portfolio Manager (Server Edition)

This project provides a full‑stack portfolio manager that runs client‑side in the browser but persists data on the server. It allows you to record transactions (buy, sell, dividends, deposits and withdrawals) using amounts and exact prices, computes holdings and portfolio value, tracks return on investment (ROI) relative to the S&P 500 (SPY) and displays configurable trading signals for each ticker.

## Features

- **Server‑side persistence** – save and load your portfolio on any device via REST endpoints.
- **Tabbed workspace** – switch between Dashboard, Holdings, Transactions, History, Metrics, Reports, and Settings views without losing context.
- **Transaction entry** – enter date, ticker, transaction type, amount invested and price; the app calculates shares automatically.
- **Holdings dashboard** – see average cost, current value, unrealised/realised PnL, ROI and position weights.
- **Signals per ticker** – define a percentage band around the last price to trigger buy/trim/hold signals.
- **ROI vs SPY** – chart your portfolio’s performance against SPY using daily price data from Stooq (no API key required).
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

All Phase 1 critical tests should pass.

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

### `GET /api/prices/:symbol?range=1y`

Returns an array of historical prices for a US ticker using Stooq. Supported query parameters:

- `range` – currently only `1y` (one year of daily data) is supported.

Example response:

```json
[
  { "date": "2024-10-01", "close": 178.59 },
  { "date": "2024-10-02", "close": 179.38 },
  …
]
```

### `GET /api/portfolio/:id`

Loads a saved portfolio with the given `id` from the `data` folder. The identifier must match `[A-Za-z0-9_-]{1,64}`; otherwise the request is rejected with HTTP `400`. Returns an empty object if the portfolio does not exist.

### `POST /api/portfolio/:id`

Saves a portfolio to the backend. Bodies are validated against the schema in [`server/middleware/validation.js`](server/middleware/validation.js):

- `transactions` must be an array of transaction objects (`date`, `ticker`, `type`, `amount`, optional `quantity`/`shares`, etc.).
- Optional `signals` map tickers to `{ pct: number }` windows.
- Optional `settings.autoClip` flag.

The identifier is validated using the same `[A-Za-z0-9_-]{1,64}` rule. Invalid identifiers or payloads yield HTTP `400` with `{ error: "VALIDATION_ERROR", details: [...] }`. Valid portfolios are stored as `data/portfolio_<id>.json`.

### Cash & benchmark endpoints

When the `features.cash_benchmarks` flag is active the API also exposes:

- `GET /api/returns/daily?from=YYYY-MM-DD&to=YYYY-MM-DD&views=port,excash,spy,bench&page=1&per_page=100`
- `GET /api/nav/daily?from=YYYY-MM-DD&to=YYYY-MM-DD&page=1&per_page=100` (includes `stale_price` flag)
- `GET /api/benchmarks/summary?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `POST /api/admin/cash-rate` accepting `{ "effective_date": "YYYY-MM-DD", "apy": 0.04 }`

List endpoints support `page`/`per_page` pagination (defaults: page 1, `per_page` 100) and return an additional `meta` block plus `ETag` headers for conditional requests.

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

# Portfolio Manager (Server Edition)

This project provides a full‑stack portfolio manager that runs client‑side in the browser but persists data on the server. It allows you to record transactions (buy, sell, dividends, deposits and withdrawals) using amounts and exact prices, computes holdings and portfolio value, tracks return on investment (ROI) relative to the S&P 500 (SPY) and displays configurable trading signals for each ticker.

## Features

- **Server‑side persistence** – save and load your portfolio on any device via REST endpoints.
- **Tabbed workspace** – switch between Dashboard, Holdings, Transactions, History, Metrics, Reports, and Settings views without losing context.
- **Transaction entry** – enter date, ticker, transaction type, amount invested and price; the app calculates shares automatically.
- **Holdings dashboard** – see average cost, current value, unrealised/realised PnL, ROI and position weights.
- **Signals per ticker** – define a percentage band around the last price to trigger buy/trim/hold signals.
- **ROI vs SPY** – chart your portfolio’s performance against SPY using daily price data from Stooq (no API key required).
- **Responsive, dark mode UI** built with React, Tailwind CSS and Recharts.

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
   | `DATA_DIR`               | string (path) | `./data` | No       | Directory for persisted portfolio files.            |
   | `PRICE_FETCH_TIMEOUT_MS` | number        | `5000`   | No       | Timeout in milliseconds for upstream price fetches. |

   Price data is fetched from [Stooq](https://stooq.com/).

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

Saves a portfolio to the backend. The request body must be a JSON object representing your portfolio state. The identifier is validated using the same `[A-Za-z0-9_-]{1,64}` rule, and payloads that are not plain JSON objects return HTTP `400`. Valid portfolios are stored as `data/portfolio_<id>.json`.

## Contributing

Feel free to fork this repository and customise it to your needs. Pull requests are welcome!

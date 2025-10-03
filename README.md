# Portfolio Manager (Server Edition)

This project provides a full‑stack portfolio manager that runs client‑side in the browser but persists data on the server.  It allows you to record transactions (buy, sell, dividends, deposits and withdrawals) using amounts and exact prices, computes holdings and portfolio value, tracks return on investment (ROI) relative to the S&P 500 (SPY) and displays configurable trading signals for each ticker.

## Features

- **Server‑side persistence** – save and load your portfolio on any device via REST endpoints.
- **Transaction entry** – enter date, ticker, transaction type, amount invested and price; the app calculates shares automatically.
- **Holdings dashboard** – see average cost, current value, unrealised/realised PnL, ROI and position weights.
- **Signals per ticker** – define a percentage band around the last price to trigger buy/trim/hold signals.
- **ROI vs SPY** – chart your portfolio’s performance against SPY using daily price data from Stooq (no API key required).
- **Responsive, dark mode UI** built with React, Tailwind CSS and Recharts.

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

   By default the server listens on port `3000` and creates a `data/` directory for saved portfolios.  Price data is fetched from [Stooq](https://stooq.com/).  You can change the port by setting the `PORT` environment variable.

3. **Start the frontend:**

   ```bash
   npm run dev
   ```

   Vite runs on port `5173` and proxies `/api` calls to the backend.

4. **Usage:**

   - Add transactions via the form.  Enter **amount** and **price**; shares are computed automatically.
   - Configure signals for each ticker by clicking the **Signals** tab.  Percentage windows determine when the last price falls below or above your buy/trim zones.
   - Save/load your portfolio by choosing a portfolio ID and pressing **Save** or **Load**.  Portfolios are stored in the backend’s `data/` folder.

### Production Deployment

To deploy the static frontend to GitHub Pages and run the backend separately:

1. Build the frontend:

   ```bash
   npm run build
   ```

2. Serve the files in `dist/` from your static host (GitHub Pages, Netlify, etc.).  If using GitHub Pages, set the `base` path in `vite.config.js` or define `VITE_BASE=/your-repo/` at build time.

3. Deploy the backend to your preferred host (Heroku, Railway, Cloudflare Workers with minimal adjustments).  For Cloudflare Workers, you can port the express logic to `fetch` handlers and use KV for storage.

## API

### `GET /api/prices/:symbol?range=1y`

Returns an array of historical prices for a US ticker using Stooq.  Supported query parameters:

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

Loads a saved portfolio with the given `id` from the `data` folder.  Returns an empty object if it doesn’t exist.

### `POST /api/portfolio/:id`

Saves a portfolio to the backend.  The request body should be a JSON object representing your portfolio state.  The server writes it to `data/portfolio_<id>.json`.

## Contributing

Feel free to fork this repository and customise it to your needs.  Pull requests are welcome!
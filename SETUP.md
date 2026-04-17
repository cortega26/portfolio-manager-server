# SETUP.md

Operational bootstrap guide for new contributors and AI agents.
For feature/architecture context see `AGENTS.md`.

## Prerequisites

| Tool    | Version | How to install                                                          |
| ------- | ------- | ----------------------------------------------------------------------- |
| Node.js | 20.19.x | `nvm use` (reads `.nvmrc`)                                              |
| npm     | ≥ 10.x  | bundled with Node 20                                                    |
| xvfb    | any     | Linux only — required for `npm run electron:smoke` (`apt install xvfb`) |

> `.nvmrc` is present at the repo root and pins `20.19.0`.

## First-time install

```bash
npm ci
npm run doctor
```

This installs all dependencies including Prettier, ESLint, Vitest, Playwright, and
Husky pre-commit hooks. Do **not** use `npm install` in CI; it mutates
`package-lock.json`.

## Environment setup

```bash
cp .env.example .env
```

Then open `.env` and fill in any optional values you need (see table below).
The app runs without any changes to `.env` for pure offline use.

### Key environment variables

| Variable                               | Default            | Notes                                                           |
| -------------------------------------- | ------------------ | --------------------------------------------------------------- |
| `PORT`                                 | `3000`             | Express port (standalone mode; Electron picks a random port)    |
| `DATA_DIR`                             | `./data`           | SQLite database location                                        |
| `LOG_LEVEL`                            | `info`             | Pino level: `trace \| debug \| info \| warn \| error`           |
| `PORTFOLIO_SESSION_TOKEN`              | `dev-secret-token` | Only used in standalone server mode; Electron generates its own |
| `ALPACA_API_KEY` / `ALPACA_API_SECRET` | —                  | Optional — enables intraday prices via Alpaca                   |
| `FEATURES_CASH_BENCHMARKS`             | `true`             | Feature flag for cash accrual and blended benchmark endpoints   |

All other variables have safe defaults in `.env.example`.

## Running locally

| Goal                             | Command                  |
| -------------------------------- | ------------------------ |
| Frontend only (Vite HMR)         | `npm run dev`            |
| Backend only (Express)           | `npm run server`         |
| Full Electron desktop (dev mode) | `npm run electron:dev`   |
| Full Electron desktop (built)    | `npm run electron:build` |

In Electron dev mode (`electron:dev`), Express and Vite start together and
the Electron shell points to the Vite dev server. No extra steps needed.

## First portfolio import

The CSV files at the repo root are the canonical source of truth for the initial
historical portfolio. Run the importer after the first `npm ci`:

```bash
# Dry-run first — no side effects, validates parsing and reconciliation
node scripts/import-csv-portfolio.mjs --dry-run

# Real import (idempotent — safe to re-run)
node scripts/import-csv-portfolio.mjs
```

Expected source files:

- `32996_asset_market_buys.csv`
- `32996_asset_market_sells.csv`
- `32996_forex_buys.csv`
- `tailormade-broker-dividends-*.csv`

After a successful import, reconciled positions must exactly match the values in
`context/KNOWN_INVARIANTS.md` (AMD, DELL, GLD, NVDA, TSLA targets).

## Validation

```bash
# Minimum required after any code change
npm test

# Bootstrap + active-doc sanity checks
npm run verify:docs

# Full pre-push gate (deps → lint → typecheck → build → smoke)
npm run verify:smoke

# Individual steps
npm run lint              # ESLint, zero warnings
npm run verify:typecheck  # TypeScript strict check
npm run test:coverage     # Vitest with lcov output
npm run test:node         # node:test backend suite
npm run test:e2e          # Playwright end-to-end
```

## Stop conditions

Stop and report before making any code changes if:

- `npm test` is already failing on the unmodified checkout
- Any invariant in `context/KNOWN_INVARIANTS.md` would be violated
- A migration would change already-reconciled position data

Do **not** push on a broken baseline.

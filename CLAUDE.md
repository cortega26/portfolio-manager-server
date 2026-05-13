# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install (must use ci, not install)
npm ci --no-fund --no-audit

# Full test suite (matches CI)
npm test

# Frontend tests (Vitest, jsdom)
npx vitest run                             # all
npx vitest run src/__tests__/Some.test.tsx  # single file

# Backend tests (node:test, uses custom runner)
npm run test:node                          # all
node --import ./server/__tests__/setup/global.js --test server/__tests__/some_test_file.js

# E2E tests (Playwright, requires build first)
npm run test:e2e
npx playwright test tests/e2e/some-spec.ts  # single file

# Coverage
npm run test:coverage                       # vitest (frontend + smoke)
npm run test:node:coverage                  # node:test (backend)

# Dev servers
npm run dev                                 # Vite HMR on :5173
npm run server                              # Fastify on :3000
npm run electron:dev                        # Full stack (Electron + Fastify + Vite)

# Quality gates (run before committing)
npm run doctor                              # verify bootstrap assumptions
npm run lint                                # eslint (zero warnings)
npm run verify:typecheck                     # tsc (all .ts/.tsx)
npm run format:check                        # prettier
npm run verify:quality                      # full quality suite
npm run verify:smoke                        # deps → lint → typecheck → build → smoke tests
npm run docs:check                          # doc contract + path checks
npm run quality:gates                       # gate alignment check

# Mutation testing (focused on ROI utils)
npm run mutate

# Other
npm run analyze                             # bundle analysis (rollup-plugin-visualizer)
npm run electron:build                      # build then run in electron
npm run format                              # prettier write
```

## Architecture

### Overview

Desktop-first portfolio tracker: **Electron shell → React UI ↔ Fastify API → SQLite**.

```
Electron (main)  ──generates session token──→  Fastify (:random port, loopback only)
React (renderer) ──session-token in header──→  REST routes ──→ Storage (SQLite)
                                                └───→ Price Providers (Stooq/Yahoo/Alpaca)
```

- All math uses `decimal.js` — no floating-point drift.
- Session token is process-scoped, generated per launch, enforced via middleware.
- PIN-locked portfolios use bcrypt-hashed local PINs.
- Prices have configurable TTL-based caching with market-hours-aware live/closed TTLs.

### Process boundary

| Layer          | Process             | SQLite access                        |
| -------------- | ------------------- | ------------------------------------ |
| React UI       | Chromium (renderer) | No                                   |
| Fastify API    | Node.js (main)      | Yes (via storage layer)              |
| Electron shell | Node.js (main)      | No (generates token, starts Fastify) |
| Scheduler/jobs | Node.js (main)      | Yes                                  |

### Test strategy

Three test systems:

1. **`node:test`** — backend tests in `server/__tests__/`, run via `tools/run-tests.mjs`. Uses `global.js` setup for env + test fixtures. Covers: API contracts, storage, finance engine, caching, auth, migrations. Property-based tests with `fast-check`.

2. **`vitest` (jsdom)** — frontend component/integration tests in `src/__tests__/` and smoke tests in `src/__smoke__/`. Uses `@testing-library/react`, `setupTests.ts`. Covers: app bootstrap, dashboard, holdings, pricing status, settings, i18n.

3. **`playwright`** — E2E tests in `tests/e2e/`. Starts a Vite preview server automatically.

### Project structure

```
├── electron/             # Electron main process (main.cjs, preload.cjs)
├── server/               # Fastify backend
│   ├── app.fastify.ts    # Fastify app factory (Zod validation, DI)
│   ├── data/             # SQLite storage layer (JsonTableStorage), price providers
│   ├── finance/          # Portfolio engine, returns, cash, lot matching (decimal.js)
│   ├── routes/           # REST route handlers (prices, portfolio, signals, etc.)
│   ├── plugins/          # Fastify plugins (session auth, request context, ETag, SPA fallback)
│   ├── jobs/             # Nightly scheduler, daily close
│   ├── migrations/       # SQLite schema migrations
│   └── __tests__/        # Backend tests (node:test)
├── src/                  # React frontend
│   ├── App.jsx           # Router root
│   ├── PortfolioManagerApp.jsx  # Main app shell
│   ├── components/       # Tab components (dashboard, holdings, transactions, etc.)
│   ├── hooks/            # Custom hooks (usePortfolioData, usePortfolioMetrics, etc.)
│   ├── state/            # Zustand store (portfolioStore.js)
│   ├── i18n/             # Translations provider + utilities
│   ├── lib/              # API client, runtime config
│   ├── utils/            # Formatting, ROI, holdings ledger, etc.
│   └── __tests__/        # Frontend tests (Vitest)
├── shared/               # Shared between server and client
│   ├── constants.js      # Cache TTLs, rate limits, schema versions
│   ├── precision.js      # decimal.js precision config
│   ├── signals.js        # Signal thresholds
│   ├── benchmarks.js     # Benchmark definitions
│   └── trust.ts          # Trust badge logic
├── tests/
│   ├── e2e/              # Playwright E2E tests
│   ├── prices/           # Price-specific node:test tests
│   └── redesign/         # Redesign node:test + vitest tests
├── tools/
│   └── run-tests.mjs     # Custom node:test runner with parallel dirs
└── docs/
    └── adr/              # Architecture Decision Records
```

### Key conventions

- **ES modules only** — no CommonJS (except `electron/main.cjs` which requires it).
- **Flat eslint config** — `eslint.config.js` with `typescript-eslint`.
- **Mixed JS/TS**: `tsconfig.json` allows JS (`checkJs: true`); `tsconfig.typecheck.json` is stricter for CI. Server has its own `tsconfig.server.json` with strict mode.
- **Env vars** in `.env` (copy from `.env.example`). `VITE_*` vars go to frontend; server vars loaded at startup.
- **Migrations** run on server startup (idempotent — checks schema version before applying).
- **Git hooks** via husky (pre-commit lint/format checks).
- **ADR tracking** — significant decisions recorded in `docs/adr/`.

## Related docs

| File                   | Purpose                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------- |
| `AGENTS.md`            | Context governance — document loading policy per task type, load order, hygiene rules |
| `AGENTS_QUICKSTART.md` | Quick operational commands for agents                                                 |
| `context/`             | Constraints, invariants, architecture, module index, task entrypoints                 |
| `docs/adr/`            | Architecture Decision Records                                                         |

**CLAUDE.md vs AGENTS.md**: this file holds codebase facts (commands, architecture, conventions). `AGENTS.md` holds meta-rules — what documents to load for each task type, load precedence, and document hygiene. Both load every session; which one you lean on depends on whether the question is "how is this built?" (CLAUDE.md) vs "how do I approach this task?" (AGENTS.md).

# ADR Index

This directory stores architecture decision records that are still relevant to the
current codebase. Treat this file as the entrypoint: read here first, then open the
specific ADR that matches the boundary you are about to change.

| ADR                                  | Status   | Topic                                                            | Key paths                                                                                                                  |
| ------------------------------------ | -------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `000-template.md`                    | Template | ADR skeleton for new decisions                                   | `docs/adr/000-template.md`                                                                                                 |
| `001-decimal-js-for-finance.md`      | Accepted | Canonical financial arithmetic uses `decimal.js`                 | `server/finance/decimal.js`, `server/finance/portfolio.js`, `server/finance/returns.js`                                    |
| `002-sqlite-local-storage.md`        | Accepted | SQLite is the sole persistence layer                             | `server/data/storage.js`, `server/data/portfolioState.js`                                                                  |
| `003-session-token-auth.md`          | Accepted | Desktop auth uses a process-scoped session token plus local PIN  | `electron/main.cjs`, `electron/preload.cjs`, `server/middleware/sessionAuth.js`, `server/auth/localPinAuth.js`             |
| `004-electron-local-desktop.md`      | Accepted | Electron is the desktop shell and owns process orchestration     | `electron/main.cjs`, `electron/preload.cjs`, `scripts/run-electron.mjs`                                                    |
| `005-local-first-architecture.md`    | Accepted | The product is local-first and offline-capable                   | `electron/`, `server/`, `data/`                                                                                            |
| `006-csv-reconciliation-strategy.md` | Accepted | Historical CSV import is deterministic and reconciliation-driven | `server/import/csvPortfolioImport.js`, `scripts/import-csv-portfolio.mjs`, `server/__tests__/csv_portfolio_import.test.js` |
| `007-react-vite-renderer.md`         | Accepted | React + Vite is the renderer stack                               | `src/`, `vite.config.js`, `src/lib/runtimeConfig.js`                                                                       |

## When to add a new ADR

Add an ADR when a change affects one of these:

- process boundaries between Electron, preload, renderer, backend, or storage
- persistence strategy or schema migration policy
- auth model, session handling, or secret exposure rules
- financial correctness guarantees or reconciliation contracts
- renderer stack or build-pipeline decisions with long-lived consequences

## Maintenance rule

- Add the new ADR file and update this index in the same change.
- If an ADR is superseded, keep the old file, update its status, and note the replacement ADR here.

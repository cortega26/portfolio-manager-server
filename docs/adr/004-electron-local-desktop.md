# ADR-004: Use Electron as the desktop shell

- **Status**: Accepted
- **Date**: 2024-01-01
- **Deciders**: Carlos / portfolio-manager-unified team

## Context

The app manages real financial data (transactions, cost basis, reconciled
positions) and must work entirely offline. A browser-based SPA would require
either a hosted server or exposing SQLite to the renderer directly — both
violate core architecture boundaries. The user needs a native-feeling desktop
experience on Linux/macOS/Windows from a single JavaScript codebase.

## Decision

Electron wraps the Express backend and the React/Vite renderer into a single
installable desktop process. The `main` process (`electron/main.cjs`) owns
process orchestration, session-token generation, and SQLite lifecycle.
The renderer is isolated from Node and the database via the minimal
`preload.cjs` bridge. No renderer code may require Node APIs directly.

## Alternatives considered

| Option              | Why rejected                                                                          |
| ------------------- | ------------------------------------------------------------------------------------- |
| Hosted web app      | Requires cloud infrastructure; breaks the local-only data guarantee                   |
| Tauri               | Rust build chain complexity; team has no Rust expertise; smaller community for SQLite |
| Browser + IndexedDB | Renderer would own persistence — violates the architecture boundary                   |
| NW.js               | Less maintained; weaker security model around `nodeIntegration`                       |

## Consequences

- **Good**: single codebase for all platforms; full Node access in `main`; strong
  process isolation via `contextIsolation: true`; existing npm toolchain reused.
- **Bad**: binary size is large (~100 MB); Electron version upgrades require
  deliberate testing; `nodeIntegration` must stay disabled in the renderer.
- **Neutral**: renderer communicates with Express via HTTP over localhost; the
  architecture is nearly identical to a traditional web app except for the process
  bootstrap, which is owned by `main`.

# Agent Quickstart

This file takes precedence over `docs/meta/automation/agents-playbook.md` for
operational commands. See `AGENTS.md` for the full context-load policy.

## This is a local desktop app — no PRs or remote branches are required.

---

## Minimum cycle (FAST lane)

```bash
npm run doctor                           # bootstrap assumptions + key files
npm ci                                    # install / verify lockfile
npm run docs:check                        # active docs must match package scripts
npm run lint                              # ESLint --max-warnings=0
NO_NETWORK_TESTS=1 npm run test:fast      # unit tests, no coverage
```

## Before touching any file

1. Read `AGENTS.md` — precedence rules and context-load policy.
2. Read `context/CONSTRAINTS.md` — edit rules and stop conditions.
3. Read `context/KNOWN_INVARIANTS.md` if the task touches finance, auth, storage, or Electron.
4. Check `context/MODULE_INDEX.md` to locate the right file before searching.
5. Check `context/runtime/ACTIVE_TASK.md` if there is in-progress work.

## After touching any file

```bash
npm test    # full suite; must stay green before moving on
```

## When to use the HEAVY lane

Only when explicitly requested:

```bash
npm run test:coverage     # coverage report
npm run leaks:repo        # gitleaks secret scan (requires gitleaks)
npm run audit:quick       # npm audit at critical level
npm run mutate:changed    # incremental mutation testing
```

## Architecture in one sentence

`Electron main` spawns `Express`, injects the session token, and loads the
`preload` bridge. The `React/Vite` renderer talks to Express over
`HTTP 127.0.0.1`. SQLite is only touched by Express. See
`context/ARCHITECTURE.md` for the full process diagram.

## Key invariants an agent must never break

- All financial arithmetic uses `decimal.js` — no native JS `+`, `*`, `/`, `-` on monetary values.
- The renderer never accesses SQLite directly.
- The session token is generated per process launch in `electron/main.cjs`; it is never written to disk.
- CSV re-imports must be idempotent; reconciliation targets are defined in `context/KNOWN_INVARIANTS.md`.

## Stop conditions

See `context/CONSTRAINTS.md § Stop conditions`. When stopping, report:

- cause
- affected file/test/contract
- minimum reasonable fix

## Expected baseline

After `npm test` on a clean checkout both runners must pass with zero failures.
Update these counts whenever the suite intentionally grows.

| Runner    | Command             | Pass | Fail | Skip |
| --------- | ------------------- | ---- | ---- | ---- |
| node:test | `npm run test:node` | ~330 | 0    | ≤1   |
| vitest    | `vitest run`        | ~79  | 0    | 0    |

If your changes cause either fail count to increase, stop and investigate before
continuing. The exact counts after the current sprint are in
`context/runtime/ACTIVE_TASK.md § Confirmed facts`.

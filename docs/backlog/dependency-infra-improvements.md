# Dependency & Infrastructure Improvements

Top-3 changes with a **positive long-term tradeoff** (cost paid once / benefit compounds),
selected from a dependency and architecture review on 2026-07-01. Ordered by
cost-to-value: cheapest and safest first.

Context for this app: **local, single-user, desktop-first** (Electron main → Fastify →
SQLite, renderer never touches storage). That framing is what qualifies these three and
disqualifies others (rate-limiting a loopback API, circuit breakers, a second charting
lib, `electron-updater` unless the app is distributed to real users).

## Legend

| Icon | Meaning     |
| ---- | ----------- |
| ✅   | Implemented |
| 🔶   | Partial     |
| ⏳   | Not started |

---

## 1. Dependency diet — drop `node-fetch` and `uuid` ⏳

Remove two dependencies that are pure redundancy on the Node 24 floor (`engines.node >= 24`).

- **Why:** Node 24 ships a global `fetch` and `crypto.randomUUID()`. Every removed
  dependency is permanently less supply-chain surface, `npm audit` noise, and version-bump
  maintenance. Cost is one-time and mechanical; benefit never has to be repaid. This is the
  cleanest positive tradeoff on the list — do it first.
- **Implementation:**
  - `node-fetch` — replace with the global `fetch`. Current usage sites:
    - [server/data/priceProviderFactory.js](../../server/data/priceProviderFactory.js) — passes a `fetchImpl` into providers; default it to the global `fetch` (bind if needed).
    - [server/data/prices.js](../../server/data/prices.js)
    - [server/runtime/startServer.ts](../../server/runtime/startServer.ts)
    - Keep the injectable `fetchImpl` seam — tests rely on it. Only the _default_ changes from `node-fetch` to global `fetch`.
  - `uuid` (`^14`) — replace `uuidv4()` call sites with `crypto.randomUUID()` (`import { randomUUID } from 'node:crypto'`). Remove `uuid` and `@types/uuid` from `devDependencies`/`dependencies`.
  - Remove both from `package.json`; run `npm ci` to refresh the lockfile.
  - Verify the price providers still honor injected `fetchImpl` in `server/__tests__/pricing_resilience.test.js` and related tests.
- **Risk:** Minimal. Global `fetch` follows the WHATWG spec — confirm no reliance on
  `node-fetch`-specific behavior (e.g. `res.body` as a Node stream vs a web `ReadableStream`;
  non-standard redirect/agent options). Grep for `.body`, `agent:`, and `import.*node-fetch`
  before deleting.
- **Estimate:** 1–2h. Ship on its own branch so the win is isolated and reviewable.

---

## 2. Adopt TanStack Query for frontend server-state ⏳

Move hand-rolled `useState`/`useEffect` fetching in the data hooks onto TanStack Query.

- **Why:** This app's core job is polling and refreshing server state (prices, metrics,
  performance). That is exactly TanStack Query's domain: request dedup, background refetch,
  stale-while-revalidate, retry/backoff, cache invalidation. Cost is one-time and _incremental_
  (adopt one hook at a time); benefit compounds — every future data-fetching feature gets
  cheaper, and we delete the code where race conditions and stale-closure bugs live. Additive,
  so downside is capped.
- **Implementation:**
  - Add `@tanstack/react-query`; wrap the app shell ([src/PortfolioManagerApp.jsx](../../src/PortfolioManagerApp.jsx)) in a single `QueryClientProvider`.
  - Keep the existing transport: [src/lib/apiClient.js](../../src/lib/apiClient.js) already handles base-URL resolution, timeout, and abort — call it from inside `queryFn`; do **not** replace it.
  - Migrate one fetching hook first as the reference pattern (suggest [src/hooks/usePerformanceData.js](../../src/hooks/usePerformanceData.js)), then [usePortfolioList.js](../../src/hooks/usePortfolioList.js) and [usePortfolioMetrics.js](../../src/hooks/usePortfolioMetrics.js).
  - Define stable query keys (e.g. `['performance', portfolioId, range]`). Use `staleTime`/`refetchInterval` tuned to the existing price TTLs in `shared/constants.js` so live vs closed-market refresh matches current behavior.
  - Prefer `invalidateQueries` on mutations (add/edit transactions) over manual refetch calls.
  - Testing: the Vitest suite already uses `@testing-library/react`; wrap rendered hooks/components in a fresh `QueryClient` per test (disable retries in tests).
- **Risk:** Low, because it's incremental — the app runs with mixed migrated/unmigrated hooks.
  Watch for double-fetching during the transition (old `useEffect` + new query on the same
  endpoint); migrate a hook fully rather than half.
- **Estimate:** 3–4h for provider + first hook (the pattern); ~1h per additional hook.

---

## 3. Swap `sql.js` for `better-sqlite3` on the price-history path ⏳

Replace the WASM engine with the native driver, **scoped first to historical prices** — the
one dataset that grows unbounded.

- **Why:** Today [server/data/storage.js](../../server/data/storage.js) (`JsonTableStorage`)
  stores every table as `row_json` TEXT and, on each write, does a full
  `DELETE ... WHERE table_name = ?` + re-`INSERT` of every row, then exports the **entire**
  in-memory DB to disk. For small portfolio tables that's fine and not worth migrating. But
  [server/services/performanceHistory.js](../../server/services/performanceHistory.js) /
  historical prices is daily prices × symbols × years — it grows without bound, and that's
  where "rewrite the whole table + re-export the whole DB on every persist" eventually bites.
  `better-sqlite3` is native and synchronous, needs no `export()`/rewrite (real WAL
  durability), and unlocks indexes + real `WHERE`/aggregation for the history queries.
- **Cost / caveat:** `better-sqlite3` is a **native module** — it needs `@electron/rebuild`
  on every Electron version bump and a per-platform build in CI, permanently. This is the
  recurring cost; it's justified only because the history dataset genuinely grows. This change
  **supersedes [ADR-008](../adr/008-json-table-storage-on-sqljs.md)**, which already lists a
  native driver as a deferred future option — write a new ADR that supersedes it.
- **Implementation:**
  - Add `better-sqlite3` + `@electron/rebuild`; wire the rebuild into the electron-builder flow (`dist:*` scripts) and CI.
  - Introduce a storage adapter behind the **existing `JsonTableStorage` interface** so it's a drop-in swap, not a rewrite of every caller. Keep the file-lock + atomic-write durability contract from ADR-008.
  - **Do not** migrate the small portfolio tables first — start with historical prices: give it real columns (`symbol`, `date`, `close`, …) + indexes instead of JSON blobs, and query it relationally in `performanceHistory.js`.
  - Provide a one-time migration that reads the current `sql.js` `data/storage.sqlite` and writes the native DB; keep a backup of the old file.
  - Run the full three-system suite (`node:test`, Vitest, Playwright) — storage is exercised across all three.
  - Write the superseding ADR (context, decision, native-rebuild consequence).
- **Risk:** Medium. Native rebuild friction in CI/packaging; a real data migration. Gate behind
  the ADR and a backup/rollback of `data/storage.sqlite`.
- **Estimate:** 1–2 days including the ADR, adapter, history-table migration, and CI rebuild wiring.

---

## Deliberately excluded

Reviewed and rejected for this app's current shape (revisit if the framing changes):

- **`electron-updater`** — only positive if the app is distributed to other users; otherwise cost (release/hosting/signing infra) with no payoff.
- **`@fastify/rate-limit`** — the API is loopback-only behind a session token; the threat is already closed.
- **Circuit breaker (opossum/cockatiel)** — timeouts + `pricing_resilience.test.js` already exist; speculative until cascading failures are observed.
- **`lightweight-charts`** — only pays off once candlestick/time-series views exist; until then it's a second charting lib alongside Recharts.

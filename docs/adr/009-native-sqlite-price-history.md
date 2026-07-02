# ADR-009: Native SQLite Price History with better-sqlite3

- **Status**: Accepted
- **Date**: 2026-07-01
- **Deciders**: Carlos / portfolio-manager-unified team
- **Supersedes**: ADR-008

## Context

ADR-008 documents `JsonTableStorage` — a JSON-over-SQLite abstraction backed by
sql.js. Every table is stored as `row_json` TEXT rows inside two fixed-schema
SQLite tables (`json_tables` + `json_table_rows`). On each write, the
implementation does a full `DELETE … WHERE table_name = ?` + re-`INSERT` of
every row, then exports the **entire** in-memory database to disk via
`db.export()`.

For small portfolio tables (transactions, signals, settings) this is fine and
not worth migrating. However, the `prices` table grows without bound — daily
prices × symbols × years. Every price update, nightly close, or performance
computation triggers a full-table scan over an ever-growing JSON blob store,
followed by a full-database serialization to disk.

ADR-008 already listed a native SQLite driver as a deferred future option.

## Decision

Introduce `better-sqlite3` — a native, synchronous SQLite driver — **scoped
exclusively to the `prices` table**. All other tables remain on
`JsonTableStorage` (sql.js).

### Architecture

```
Callers (routes, jobs, services)
         │
    ┌────▼──────────────────────────────────────┐
    │           HybridStorage                     │
    │                                              │
    │  table == 'prices' → NativePriceStore        │
    │  table != 'prices' → JsonTableStorage        │
    │                                              │
    │  getPriceStore() → direct native queries     │
    └────┬──────────────────┬────────────────────┘
         │                  │
    ┌────▼──────┐    ┌──────▼──────────────┐
    │ prices.db │    │ storage.sqlite       │
    │ (WAL)     │    │ (sql.js, unchanged)  │
    └───────────┘    └─────────────────────┘
```

### Key components

- **`NativePriceStore`** (`server/data/nativePriceStore.js`) — wraps
  better-sqlite3 with a real typed schema (`ticker`, `date`, `adj_close`,
  `updated_at`), composite primary key, secondary indexes, and WAL journal
  mode. Exposes both backward-compatible `StorageAdapter` methods (async)
  and optimized relational query methods (sync).

- **`HybridStorage`** (`server/data/hybridStorage.js`) — routes `prices`
  table calls to `NativePriceStore` and all other tables to
  `JsonTableStorage`. Implements the full `StorageAdapter` interface so no
  caller changes are required. Exposes `getPriceStore()` so
  performance-critical paths can use relational queries directly.

- **`storage.sqlite`** continues to store all non-prices tables via sql.js,
  unchanged. `prices.db` is a separate file managed by better-sqlite3.

### Migration

On first startup with the new code, `NativePriceStore.open()` detects the
existing `storage.sqlite`. If `prices.db` does not yet exist, it reads the
JSON `prices` rows from the legacy DB, bulk-inserts them into the native DB
in a single transaction, and renames `storage.sqlite` → `storage.sqlite.bak`
as a backup. The migration is idempotent and automatic.

### Performance wins

| Operation                          | Before (sql.js)                                                    | After (better-sqlite3)                                             |
| ---------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Read all prices                    | Load entire DB, parse JSON for all rows                            | `SELECT * FROM prices ORDER BY date, ticker`                       |
| Read prices by ticker + date range | Load entire DB, filter in JS                                       | `SELECT … WHERE ticker IN (…) AND date BETWEEN ? AND ?` with index |
| Upsert one price row               | Load all rows for table, merge, rewrite all rows, export entire DB | `INSERT … ON CONFLICT DO UPDATE`                                   |
| Batch upsert N price rows          | N × (load all + merge + rewrite + export)                          | Single transaction, N prepared statements                          |

## Consequences

### Positive

- **Unbounded growth handled**: the `prices` table scales with real SQLite
  indexes instead of in-memory JSON scans and full-DB exports.

- **Zero caller changes**: `HybridStorage` implements the `StorageAdapter`
  interface; all existing code paths work unchanged. Performance-critical
  paths (`performanceHistory.js`, `daily_close.js`) gain direct relational
  queries via `getPriceStore()`.

- **WAL durability**: writes are crash-safe without the `db.export()` +
  atomic-write cycle. better-sqlite3's synchronous API eliminates
  per-operation file-lock overhead for the prices path.

- **Backward compatible**: `sql.js` remains a dependency for the external R2
  database import and for the one-time migration. The `JsonTableStorage`
  class is unchanged.

### Negative / costs

- **Native module rebuild**: `better-sqlite3` is a native addon. Every
  Electron version bump requires `electron-rebuild -f -w better-sqlite3`.
  This is documented in the `rebuild` npm script and baked into `dist:*`.

- **asar unpacking**: the native `.node` binary must be unpacked from the
  asar archive. `electron-builder.yml` now includes `asarUnpack` for
  `better-sqlite3/**`.

- **Two database files**: `storage.sqlite` + `prices.db` must be kept
  together in the `DATA_DIR`. Migration failure or manual file manipulation
  could leave them out of sync.

- **ADR-008 superseded**: the repository no longer uses a single storage
  backend. Future contributors must understand the hybrid architecture.

## Rollback

1. Delete `data/prices.db` (and any `prices.db-wal`, `prices.db-shm`).
2. Rename `data/storage.sqlite.bak` → `data/storage.sqlite`.
3. Revert the code changes (remove `better-sqlite3`, restore
   `JsonTableStorage` imports in `runMigrations` and `startServer.ts`).
4. Run `npm ci` to restore the lockfile.

## References

- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- [@electron/rebuild](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules)
- ADR-008 (superseded)

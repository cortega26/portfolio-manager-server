# ADR-002: Use SQLite as the sole persistence layer

- **Status**: Superseded by ADR-008
- **Date**: 2024-01-01
- **Deciders**: Carlos / portfolio-manager-unified team

## Context

The application is desktop-first and designed to run entirely offline with no
cloud dependency. All portfolio data — transactions, prices, benchmarks, signals,
and notifications — must survive process restarts and be portable as a single
file. The user base is a single local user per machine; there is no concurrent
multi-user write requirement.

> Historical note: this ADR captures the persistence boundary decision.
> The live storage engine and `JsonTableStorage` abstraction are now described more
> precisely in ADR-008.

## Decision

SQLite (accessed via `sql.js` in the browser bundle and directly via the
`sqlite3` module server-side) is the sole persistent store. All reads and writes
go through the Express API layer (`server/data/storage.js`) and never directly
from the renderer. The database file is a single `.sqlite` artifact, making
backup trivial (copy the file).

## Alternatives considered

| Option                    | Why rejected                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------- |
| PostgreSQL / MySQL        | Requires a running server process; defeats the desktop-first, no-cloud goal           |
| LevelDB / RocksDB         | Key-value only — requires application-level query logic for relational portfolio math |
| IndexedDB (renderer-side) | Violates the architecture boundary: renderer must not own persistence                 |
| JSON files                | No transactions, no ACID guarantees, fragile under crash/power loss                   |

## Consequences

- **Good**: zero-dependency portable file; trivial backup; full SQL for
  relational portfolio queries; ACID transactions for import reconciliation.
- **Bad**: not suitable if the app ever needs multi-machine sync or concurrent
  writes from multiple processes.
- **Neutral**: migrations managed manually via numbered migration files
  (`server/data/migrations/`); schema changes require a migration entry.

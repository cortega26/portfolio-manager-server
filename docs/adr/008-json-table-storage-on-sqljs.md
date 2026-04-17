# ADR-008: JsonTableStorage on sql.js-backed SQLite file

- **Status**: Accepted
- **Date**: 2026-04-16
- **Deciders**: Carlos / portfolio-manager-unified team
- **Supersedes**: ADR-002

## Context

The live storage implementation in `server/data/storage.js` no longer matches the
older wording in ADR-002 closely enough.

Today the repository uses:

- a single local SQLite file at `data/storage.sqlite`
- `sql.js` as the database engine inside the server storage layer
- `JsonTableStorage` as the repo-facing abstraction for table-like persistence
- file locking plus atomic writes to keep the local database durable

That means SQLite remains the persistence boundary, but the implementation details
matter for maintenance, debugging, and future migrations.

## Decision

The canonical persistence model is:

1. `server/data/storage.js` owns the database lifecycle through `JsonTableStorage`.
2. The database is a local SQLite file persisted by exporting the `sql.js`
   in-memory database to `data/storage.sqlite`.
3. Repo-facing persistence remains table-oriented JSON rows stored inside SQLite
   tables, rather than ad hoc JSON files spread across the filesystem.
4. The renderer still never touches storage directly; all reads and writes cross
   the Express boundary.

## Alternatives considered

| Option                                                   | Why rejected                                                                                |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Keep ADR-002 as-is                                       | It no longer describes the storage engine and abstraction precisely enough for maintainers. |
| Replace `sql.js` immediately with a native SQLite driver | Useful as a future option, but not required to describe the current architecture correctly. |
| Store raw JSON files directly                            | Reintroduces weaker durability and bypasses the existing storage boundary.                  |

## Consequences

- **Good**: ADRs now match the real storage code, reducing agent and maintainer confusion.
- **Bad**: any future switch to a native SQLite driver will require another explicit ADR and migration plan.
- **Neutral**: SQLite is still the persistence contract; this ADR mainly makes the current engine and abstraction explicit.

# ADR-005: Local-first, offline-capable architecture

- **Status**: Accepted
- **Date**: 2024-01-01
- **Deciders**: Carlos / portfolio-manager-unified team

## Context

Portfolio data is sensitive and personal. Price fetches from external APIs are
already the only required network calls. The user should never be locked out of
their own data due to network conditions, cloud provider outages, or subscription
lapses. Cloud sync would add an attack surface, vendor lock-in, and GDPR-scope
complexity with no offsetting benefit for a single-user tool.

## Decision

All persistent state lives in a local SQLite file under `DATA_DIR`. The Express
API binds exclusively to `127.0.0.1`. No data is ever transmitted to an external
server except outbound price API calls (Alpaca, Yahoo Finance — optional). There
is no user account, no cloud sync, and no remote authentication.

## Alternatives considered

| Option                      | Why rejected                                                                       |
| --------------------------- | ---------------------------------------------------------------------------------- |
| Cloud-hosted backend        | Vendor dependency; data privacy risk; requires auth infrastructure                 |
| Hybrid (local + cloud sync) | Adds conflict-resolution complexity; not needed for single-user portfolio tracking |
| Browser localStorage / IDB  | Size limits; no server-side finance logic; reconciliation would live in renderer   |
| Remote PostgreSQL           | Defeats the local-first goal; requires a server process the user must manage       |

## Consequences

- **Good**: works fully offline; no vendor lock-in; trivial backup (copy one
  `.sqlite` file); no user account management.
- **Bad**: no multi-device sync; if the local disk fails, data is lost unless the
  user keeps their own backups.
- **Neutral**: optional price-feed APIs are the only outbound network surface;
  their failure degrades price freshness but never blocks portfolio read access.

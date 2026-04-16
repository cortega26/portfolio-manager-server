# ADR-006: CSV reconciliation strategy for historical import

- **Status**: Accepted
- **Date**: 2024-01-01
- **Deciders**: Carlos / portfolio-manager-unified team

## Context

The initial portfolio state must be bootstrapped from four broker-exported CSV
files (buys, sells, forex buys, dividends). The broker data is imperfect:

- `NVDA` requires a `10:1` split adjustment for operations before `2024-06-10`.
- `LRCX` positions must reconcile to exactly `0` after all buys/sells.
- The five active positions must match exact fractional quantities down to 9
  decimal places to be considered reconciled.
- Re-running the import must produce the same result (idempotence).

Without a strict reconciliation contract, re-imports silently produce drift,
making the portfolio state unreliable.

## Decision

The importer (`server/import/csvPortfolioImport.js`) applies these rules
explicitly and centrally:

1. **Deterministic keys**: every record is keyed on `(asset, date, type,
source_row_hash)` so re-import is idempotent — duplicate rows are skipped,
   not doubled.
2. **Split adjustments**: applied as a transform pass before any
   arithmetic, keyed on `(asset, cutoff_date, ratio)` from a config table.
3. **Explicit reconciliation targets**: after import, final positions are
   compared against the known-good targets defined in `KNOWN_INVARIANTS.md`.
   A mismatch aborts with a detailed diff, not a silent pass.
4. **`decimal.js` throughout**: no native JS arithmetic on any quantity or
   amount (see ADR-001).
5. **`--dry-run` flag**: the CLI always supports a no-side-effect preview pass.

## Alternatives considered

| Option                           | Why rejected                                                                      |
| -------------------------------- | --------------------------------------------------------------------------------- |
| Accept small float discrepancies | Silently wrong positions; reconciliation would be meaningless                     |
| Store broker records verbatim    | Does not handle split adjustments or idempotent re-import                         |
| Manual one-time SQL insert       | Not reproducible; cannot be validated by CI                                       |
| External ETL tool                | Adds a dependency; reconciliation logic must stay testable in the same test suite |

## Consequences

- **Good**: re-import is safe and verifiable; reconciliation failures are loud,
  not silent; split logic is isolated and testable.
- **Bad**: adding a new broker or a new corporate action requires an explicit
  config entry and a new test case — there is no fuzzy auto-detection.
- **Neutral**: the reconciliation targets in `KNOWN_INVARIANTS.md` are the
  single source of truth; any change to broker data must be reflected there first.

# ADR-001: Use decimal.js for all financial arithmetic

- **Status**: Accepted
- **Date**: 2024-01-01
- **Deciders**: Carlos / portfolio-manager-unified team

## Context

JavaScript's native `Number` type uses IEEE 754 double-precision floating-point,
which silently accumulates rounding error in monetary operations
(e.g. `0.1 + 0.2 !== 0.3`). This project tracks real financial positions — cost
basis, average prices, ROI, and CSV reconciliation — where even sub-cent drift
produces incorrect final positions. The reconciliation target positions
(e.g. `NVDA 0.815097910`, `AMD 0.305562260`) must match exactly across repeated
import runs.

## Decision

All monetary values, share quantities, cost aggregations, ROI calculations, and
reconciliation comparisons use `decimal.js`. Native JS arithmetic (`+`, `*`, `/`,
`-`) is forbidden on any financial value. This rule is codified in
`context/KNOWN_INVARIANTS.md` and canonical helpers live in
`server/finance/decimal.js`.

## Alternatives considered

| Option           | Why rejected                                                                            |
| ---------------- | --------------------------------------------------------------------------------------- |
| Native JS floats | Silent precision loss — unacceptable for reconciliation invariants                      |
| `big.js`         | Smaller API surface, lacks `ROUND_HALF_EVEN` and full `toDecimalPlaces` control         |
| `currency.js`    | UI-display-focused; not suitable for multi-currency backend math or quantity arithmetic |
| `bignumber.js`   | Functionally equivalent but `decimal.js` was already present and is more widely audited |

## Consequences

- **Good**: deterministic reconciliation across runs; float drift impossible in
  portfolio math.
- **Bad**: every financial operation requires explicit `new Decimal(x)` wrapping
  — more verbose than native operators.
- **Neutral**: enforced by lint-level convention (`KNOWN_INVARIANTS.md`) rather
  than a compile-time type guard; relies on discipline and test coverage.

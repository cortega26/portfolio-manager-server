# Math & Precision Policy

The portfolio engine now performs all internal calculations using [`decimal.js`](https://mikemcl.github.io/decimal.js/) with explicit cent and micro-share units. The goals are:

- **Deterministic ledger math** — intermediate rounding at two decimal places (cash) or six decimal places (shares) happens only when converting to/from storage or API payloads.
- **Reduced floating-point drift** — accumulation uses integer cents and Decimal operations, ensuring long ledgers remain stable.
- **Explicit boundaries** — APIs continue to surface plain JavaScript numbers, but every value exposed to clients is derived from rounded cents or micro-shares.

## Implementation Highlights

| Area | Strategy |
|------|----------|
| Cash balances | Convert inputs to integer cents via `toCents`, sum in integers, and expose numbers with `fromCents`. |
| Holdings | Track share quantities as integer micro-shares (1e-6 precision) internally. |
| Returns & benchmarks | Compute TWR steps, blended benchmarks, and summaries with Decimal arithmetic before rounding to eight decimals for the API. |
| Interest accrual | Use Decimal APY → daily rate conversion; persist accruals rounded to cents with deterministic IDs. |
| Serialization | JSON storage & API responses emit rounded numbers; reloading the ledger reconstructs Decimal states exactly. |

Refer to [`server/finance/decimal.js`](../server/finance/decimal.js) for helper utilities and the updated tests under `server/__tests__` for property-style coverage against drift.

## Transaction Ordering & Determinism

- Transactions are stored with deterministic same-day ordering: `DEPOSIT → BUY → SELL → DIVIDEND → INTEREST → WITHDRAWAL → FEE`.
- When multiple entries share the same date and type, ordering falls back to the metadata recorded on each transaction:
  1. `createdAt` — UTC millisecond timestamp recorded on save and kept strictly increasing per portfolio.
  2. `seq` — a monotonic sequence counter assigned (or normalized) on every save.
  3. `id` then `uid` — legacy identifiers preserved for stability.
- The server normalizes these fields during persistence so replays, imports, and concurrent saves all produce stable ledger projections.

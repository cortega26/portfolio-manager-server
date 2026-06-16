# Plan 006: Eliminate repeated transaction sorts in inboxComputer

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md` — unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 21ff5b1..HEAD -- server/finance/inboxComputer.ts`
> If this file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `21ff5b1`, 2026-06-16

## Why this matters

`computeInbox` sorts the same transaction array four separate times — once in `computeInbox` itself, once in `deriveAverageCost`, once in `firstTransactionDate`, and once inside `projectStateUntil`. Each `sortTransactions` call also clones the array (`[...transactions]`), creating GC pressure. Sorting once and passing the sorted array through eliminates O(3·N·log N) wasted work and reduces allocations. For 990 transactions, this is ~12,000 unnecessary comparison operations per inbox computation.

## Current state

- `server/finance/inboxComputer.ts:124` — `deriveAverageCost` sorts:

  ```ts
  function deriveAverageCost(transactions: Transaction[], ticker: string): number | null {
    const sorted = sortTransactions(transactions as never[]) as unknown as Transaction[];
  ```

- `server/finance/inboxComputer.ts:157` — `firstTransactionDate` sorts:

  ```ts
  function firstTransactionDate(transactions: Transaction[], ticker: string): string | null {
    const sorted = sortTransactions(transactions as never[]) as unknown as Transaction[];
  ```

- `server/finance/inboxComputer.ts:185` — `computeInbox` sorts:

  ```ts
  const sorted = sortTransactions(transactions as never[]) as unknown as Transaction[];
  ```

- `server/finance/inboxComputer.ts:188` — `projectStateUntil` sorts internally (in `portfolio.ts`).

- `server/finance/portfolio.ts` — `sortTransactions` clones and sorts:
  ```ts
  export function sortTransactions(transactions: TransactionLike[]): TransactionLike[] {
    return [...transactions].sort(/* ... */);
  }
  ```

The call chain: `computeInbox` → `buildPortfolioSignalRows` (which sorts) AND `deriveAverageCost` (sorts) AND `firstTransactionDate` (sorts) AND `projectStateUntil` (sorts).

## Commands you will need

| Purpose            | Command                           | Expected on success |
| ------------------ | --------------------------------- | ------------------- |
| Backend tests      | `npm run test:node`               | all pass            |
| Lint               | `npm run lint`                    | exit 0              |
| Typecheck (server) | `npm run verify:typecheck:server` | exit 0              |

## Scope

**In scope**:

- `server/finance/inboxComputer.ts` — sort once, pass sorted array to helpers

**Out of scope**:

- `server/finance/portfolio.ts` — `sortTransactions` itself is correct; we're fixing its callers, not the function
- Other callers of `sortTransactions` — they each need their own analysis
- The `as never[]` casts — those are a separate concern (structural type-safety issue, not perf)

## Git workflow

- Branch: `advisor/006-eliminate-repeated-sorts`
- Commit style: `perf: sort transactions once in inboxComputer instead of four times`

## Steps

### Step 1: Sort once in computeInbox and thread through

The fix: sort once at the top of `computeInbox`, then pass the pre-sorted array to `deriveAverageCost`, `firstTransactionDate`, `projectStateUntil`, and `buildPortfolioSignalRows`. Each helper currently sorts independently — change them to accept an optional pre-sorted flag or simply trust the caller.

**Recommended approach** (minimal, safe): Sort once in `computeInbox` and pass the sorted array. The helpers `deriveAverageCost` and `firstTransactionDate` are ONLY called from `computeInbox` (verify with `grep -rn "deriveAverageCost\|firstTransactionDate" server/`). So changing their signatures to accept a pre-sorted array is safe.

In `server/finance/inboxComputer.ts`:

1. Change `deriveAverageCost` signature to accept an optional pre-sorted array parameter:

```ts
function deriveAverageCost(
  transactions: Transaction[],
  ticker: string,
  sorted?: Transaction[]
): number | null {
  const sorted = sortedTx ?? sortTransactions(transactions as never[]) as unknown as Transaction[];
```

Better: just accept a required `sortedTransactions` parameter since it's always called with one:

```ts
function deriveAverageCost(
  sortedTransactions: Transaction[],
  ticker: string
): number | null {
  // no sort needed — caller guarantees sorted
```

2. Same for `firstTransactionDate`:

```ts
function firstTransactionDate(
  sortedTransactions: Transaction[],
  ticker: string
): string | null {
  // no sort needed
```

3. In `computeInbox`, sort once and pass down:

```ts
export function computeInbox(input: InboxComputerInput): InboxItem[] {
  // ...
  const sorted = sortTransactions(transactions as never[]) as unknown as Transaction[];

  // Use sorted for everything:
  const lastDate = sorted.length > 0
    ? ((sorted[sorted.length - 1] as Transaction).date ?? todayKey)
    : todayKey;
  const projected = projectStateUntil(sorted as never[], lastDate);
  // ...

  // When calling deriveAverageCost and firstTransactionDate, pass sorted:
  const avgCost = deriveAverageCost(sorted, ticker);
  const firstDate = firstTransactionDate(sorted, ticker);
```

4. For `buildPortfolioSignalRows` (line 201), check if it also sorts internally. If it does (it calls `sortTransactions` inside `signalNotifications.js:62`), consider whether passing a pre-sorted array would help — but `signalNotifications.js` is a separate module. For now, the main win is eliminating the sorts in `computeInbox`, `deriveAverageCost`, and `firstTransactionDate`.

**Verify**: `grep -n "sortTransactions" server/finance/inboxComputer.ts` → should show only 1 call (in `computeInbox`), not 3.

### Step 2: Run tests

**Verify**: `npm run test:node` → all tests pass, including any that exercise inbox computation.

## Test plan

No new tests required — this is a pure refactor. The existing inbox tests verify behavioral equivalence:

- `npm run test:node -- --test-name-pattern="inbox"` → all inbox tests pass with identical results.

## Done criteria

- [ ] `grep -c "sortTransactions" server/finance/inboxComputer.ts` returns `1` (down from 3+)
- [ ] `npm run test:node` exits 0; all tests pass
- [ ] `npm run lint` exits 0
- [ ] `npm run verify:typecheck:server` exits 0
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- `deriveAverageCost` or `firstTransactionDate` are called from any file other than `inboxComputer.ts` (check with `grep -rn "deriveAverageCost\|firstTransactionDate" server/`). If so, those external callers also need updating.
- The `projectStateUntil` function ALSO re-sorts even when the input is already sorted — check `portfolio.ts:projectStateUntil`. If it sorts unconditionally, consider adding a `preSorted` option or just accept the single extra sort (the main win is removing the 3 sorts in inboxComputer.ts).
- Any test fails — the behavioral change must be invisible to callers.

## Maintenance notes

- The `sortTransactions` clone-then-sort pattern is safe but allocates. If inbox computation becomes a hot path, consider adding an in-place sort option to `sortTransactions`.
- `buildPortfolioSignalRows` in `signalNotifications.js` also sorts internally. If it's ever refactored, consider passing a pre-sorted array from `computeInbox`.
- The `as never[]` casts are a separate type-safety concern; plan 004's approach to storage typing may eventually eliminate the need for these casts at the storage boundary, making financial computation types flow cleanly.

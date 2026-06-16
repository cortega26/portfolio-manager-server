# Plan 004: Fix race condition in writePortfolioState — move reads inside the lock

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md` — unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 21ff5b1..HEAD -- server/data/portfolioState.js server/data/storage.js server/__tests__/storage_concurrency.test.js`
> If these files changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `21ff5b1`, 2026-06-16

## Why this matters

`writePortfolioState` reads existing transactions and portfolio states OUTSIDE the `atomicBatchWrite` lock, then writes INSIDE the lock. In the window between the read (lines 92, 99) and the write (line 107), another concurrent request could modify the same tables. The second write then silently clobbers the first request's changes. While the single-user desktop deployment makes this unlikely, the API server path is exposed — if two write operations for different portfolios arrive concurrently (possible under Fastify's async handler model), one portfolio's data can be lost. The fix: move both reads inside the `atomicBatchWrite` lock, which already provides a serialized, transactional context.

## Current state

- `server/data/portfolioState.js:81-111` — current code with the race:

  ```js
  export async function writePortfolioState(storage, portfolioId, state) {
    const record = normalizePortfolioRecord(state, portfolioId);
    const transactions = Array.isArray(state?.transactions)
      ? state.transactions.map((transaction) => ({
          ...cloneValue(transaction),
          portfolio_id: portfolioId,
        }))
      : [];

    // Build the full transactions table: keep rows belonging to OTHER portfolios,
    // then append the new rows for this portfolio — all written atomically.
    const existingTransactions = await storage.readTable(TRANSACTIONS_TABLE); // ← READ outside lock
    const otherPortfolioTransactions = existingTransactions.filter(
      (row) => row?.portfolio_id !== portfolioId
    );
    const nextTransactions = [...otherPortfolioTransactions, ...transactions];

    // Read existing portfolio_states so we can upsert without clobbering others.
    const existingStates = await storage.readTable(PORTFOLIO_STATE_TABLE); // ← READ outside lock
    const nextRecord = { ...record, updated_at: new Date().toISOString() };
    const otherStates = existingStates.filter((row) => row?.id !== portfolioId);
    const nextStates = [...otherStates, nextRecord];

    // Single atomic write: one lock, one SQLite transaction, one persist.
    await storage.atomicBatchWrite([
      // ← WRITE inside lock
      { table: TRANSACTIONS_TABLE, rows: nextTransactions },
      { table: PORTFOLIO_STATE_TABLE, rows: nextStates },
    ]);
  }
  ```

- `server/data/storage.js:292-344` — `atomicBatchWrite` already provides the lock + transaction:

  ```js
  async atomicBatchWrite(operations) {
    await withLock(this.storageLockKey(), async () => {
      const db = await this.getDatabase();
      db.run('BEGIN TRANSACTION');
      try {
        for (const { table, rows } of operations) {
          this.writeTableToDatabase(db, table, rows);
        }
        db.run('COMMIT');
        await this.persistDatabase(db);
      } catch (err) {
        db.run('ROLLBACK');
        throw err;
      }
    });
  }
  ```

  The lock is provided by `withLock` from `server/utils/locks.js`. All `readTable` calls are safe inside the lock — `readTable` reads from the in-memory SQLite instance passed through `getDatabase()`.

- `server/__tests__/storage_concurrency.test.js` exists and tests concurrent write behavior. This is the pattern to follow for the new test.

The key insight: both reads and writes need to be inside the same `withLock` scope to be atomic. The simplest correct fix wraps the entire read-merge-write sequence in `storage.atomicBatchWrite` by passing a "prepare" callback, or by exposing `withLock` and calling readTable inside it.

## Commands you will need

| Purpose            | Command                           | Expected on success |
| ------------------ | --------------------------------- | ------------------- |
| Backend tests      | `npm run test:node`               | all 496 pass        |
| Lint               | `npm run lint`                    | exit 0              |
| Typecheck (server) | `npm run verify:typecheck:server` | exit 0              |

## Scope

**In scope**:

- `server/data/portfolioState.js` — move reads inside the lock
- `server/data/storage.js` — add a `withStorageLock` method that exposes the lock for callers that need read-then-write atomicity (alternative: export `withLock` directly, or accept a prepare callback in `atomicBatchWrite`)

**Out of scope**:

- `deletePortfolioState` — it follows a similar pattern (read then write) but is called less frequently; fixing it is a follow-up
- Other callers of `readTable` + `writeTableToDatabase` — each needs its own analysis
- The `atomicBatchWrite` implementation itself — it's correct
- React components or frontend state management

## Git workflow

- Branch: `advisor/004-race-condition-write-portfolio-state`
- Commit style: `fix: move readTable calls inside the lock in writePortfolioState`

## Steps

### Step 1: Add a method to storage that allows atomic read-then-write

The cleanest approach: add an `atomicReadWrite` method to `JsonTableStorage` that runs a callback inside the lock, giving it access to `readTable` and `writeTable`. This avoids exporting `withLock` directly and keeps the abstraction clean.

In `server/data/storage.js`, add this method to the `JsonTableStorage` class (after `atomicBatchWrite`):

```js
  /**
   * Runs `callback` inside the storage lock, passing the db instance.
   * Use this when you need to read-then-write atomically.
   *
   * @param {(db: import('sql.js').Database) => Promise<void>} callback
   */
  async atomicReadWrite(callback) {
    await withLock(this.storageLockKey(), async () => {
      const db = await this.getDatabase();
      await callback(db);
    });
  }
```

Wait — this doesn't give access to `readTable` which uses `ensureBootstrap`. Let's reconsider.

**Simpler approach**: Since `atomicBatchWrite` already holds the lock and provides a transactional context, we can extend it to accept an optional `prepare` callback that runs inside the lock before the writes. Or even simpler: have `writePortfolioState` call `storage.atomicBatchWrite` with a function that first reads, then returns the operations.

**Recommended approach** (minimal change, clearest semantics):

Add a new method to `JsonTableStorage` in `server/data/storage.js`:

```js
  async withAtomicLock(scope) {
    await withLock(this.storageLockKey(), async () => {
      await scope({
        readTable: (name) => this.ensureBootstrap(name, { createIfMissing: true, defaultValue: [] }),
        writeTable: (name, rows) => this.writeTableToDatabase(await this.getDatabase(), name, rows),
      });
      const db = await this.getDatabase();
      await this.persistDatabase(db);
    });
  }
```

This gives callers a scoped object with `readTable` and `writeTable` that are safe inside the lock.

**Verify**: `node --check server/data/storage.js` → no syntax errors.

### Step 2: Refactor writePortfolioState to use the new method

In `server/data/portfolioState.js`, change `writePortfolioState` to use `storage.withAtomicLock`:

```js
export async function writePortfolioState(storage, portfolioId, state) {
  const record = normalizePortfolioRecord(state, portfolioId);
  const transactions = Array.isArray(state?.transactions)
    ? state.transactions.map((transaction) => ({
        ...cloneValue(transaction),
        portfolio_id: portfolioId,
      }))
    : [];

  await storage.withAtomicLock(async ({ readTable, writeTable }) => {
    // Both reads now happen inside the lock — no race window.
    const existingTransactions = await readTable(TRANSACTIONS_TABLE);
    const otherPortfolioTransactions = existingTransactions.filter(
      (row) => row?.portfolio_id !== portfolioId
    );
    const nextTransactions = [...otherPortfolioTransactions, ...transactions];

    const existingStates = await readTable(PORTFOLIO_STATE_TABLE);
    const nextRecord = { ...record, updated_at: new Date().toISOString() };
    const otherStates = existingStates.filter((row) => row?.id !== portfolioId);
    const nextStates = [...otherStates, nextRecord];

    writeTable(TRANSACTIONS_TABLE, nextTransactions);
    writeTable(PORTFOLIO_STATE_TABLE, nextStates);
  });
}
```

**Verify**: `grep -n "readTable\|atomicBatchWrite" server/data/portfolioState.js` → should show the new pattern inside `withAtomicLock`, not the old standalone calls.

### Step 3: Update existing tests

The existing tests in `server/__tests__/portfolio.test.js` and `server/__tests__/storage_concurrency.test.js` exercise `writePortfolioState`. Run them:

**Verify**: `npm run test:node -- --test-name-pattern="portfolio|storage_concurrency"` → all tests pass.

### Step 4: Add a concurrency test for the race condition

In `server/__tests__/storage_concurrency.test.js`, add a test that simulates concurrent writes:

```js
test('writePortfolioState: concurrent writes for different portfolios do not lose data', async () => {
  const storage = await createTestStorage();

  // Write initial state for portfolio A with 1 transaction.
  await writePortfolioState(storage, 'portfolio-a', {
    transactions: [{ id: 'tx-a-1', ticker: 'AAPL', type: 'BUY', shares: 10, date: '2024-01-01' }],
  });

  // Write initial state for portfolio B with 1 transaction.
  await writePortfolioState(storage, 'portfolio-b', {
    transactions: [{ id: 'tx-b-1', ticker: 'MSFT', type: 'BUY', shares: 5, date: '2024-01-01' }],
  });

  // Simulate concurrent writes: both portfolios add a transaction at the same time.
  await Promise.all([
    writePortfolioState(storage, 'portfolio-a', {
      transactions: [
        { id: 'tx-a-1', ticker: 'AAPL', type: 'BUY', shares: 10, date: '2024-01-01' },
        { id: 'tx-a-2', ticker: 'GOOG', type: 'BUY', shares: 3, date: '2024-01-02' },
      ],
    }),
    writePortfolioState(storage, 'portfolio-b', {
      transactions: [
        { id: 'tx-b-1', ticker: 'MSFT', type: 'BUY', shares: 5, date: '2024-01-01' },
        { id: 'tx-b-2', ticker: 'TSLA', type: 'BUY', shares: 2, date: '2024-01-02' },
      ],
    }),
  ]);

  // Both portfolios should have exactly 2 transactions each.
  const allTransactions = await storage.readTable('transactions');
  const aTx = allTransactions.filter((r) => r.portfolio_id === 'portfolio-a');
  const bTx = allTransactions.filter((r) => r.portfolio_id === 'portfolio-b');

  assert.equal(aTx.length, 2, 'portfolio A should have 2 transactions');
  assert.equal(bTx.length, 2, 'portfolio B should have 2 transactions');
  assert.equal(allTransactions.length, 4, 'total should be 4 transactions');
});
```

**Verify**: `npm run test:node -- --test-name-pattern="concurrent writes"` → test passes.

## Test plan

- Update existing tests to confirm the refactored `writePortfolioState` works identically.
- Add the concurrent-write test above to `server/__tests__/storage_concurrency.test.js`.
- Pattern to follow: `server/__tests__/storage_concurrency.test.js` — it already imports `writePortfolioState` and tests atomic operations.
- **Verification**: `npm run test:node` → all 496+ tests pass, including the new concurrency test.

## Done criteria

- [ ] `server/data/storage.js` has the new `withAtomicLock` method
- [ ] `server/data/portfolioState.js` uses `withAtomicLock` instead of standalone `readTable` + `atomicBatchWrite`
- [ ] `npm run test:node` exits 0; new concurrency test passes
- [ ] `npm run lint` exits 0
- [ ] `npm run verify:typecheck:server` exits 0
- [ ] `grep -rn "readTable\|atomicBatchWrite" server/data/portfolioState.js` shows they're called inside `withAtomicLock`
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- The code at the locations in "Current state" doesn't match the excerpts (the codebase has drifted).
- The new `withAtomicLock` approach breaks the `atomicBatchWrite` method — verify `atomicBatchWrite` still works for its existing callers.
- The concurrency test fails — it's designed to catch exactly the race condition this plan fixes.
- Any existing test breaks — the refactored `writePortfolioState` must produce identical results.

## Maintenance notes

- `deletePortfolioState` has the same read-then-write pattern (reads `readTable('transactions')` outside the lock, then calls `atomicBatchWrite`). It should be migrated to `withAtomicLock` in a follow-up, but the risk is lower because deletions are rarer than writes.
- If `writePortfolioState` ever needs to read from tables other than `transactions` and `portfolio_states`, the `readTable` function inside `withAtomicLock` already supports any table name.
- The `withAtomicLock` pattern is the canonical approach for any operation that reads-then-writes. Document this in the module's JSDoc.

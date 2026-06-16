# Plan 002: Fix silent JSON export failure — show error toast on export failure

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md` — unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 21ff5b1..HEAD -- src/PortfolioManagerApp.jsx`
> If this file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `21ff5b1`, 2026-06-16

## Why this matters

When a user clicks "Export JSON" and the operation fails (server error, Blob creation failure, memory issue), the catch block silently swallows the error with `// silently fail`. The user sees no feedback and assumes the export succeeded — but no file was downloaded. This is a data-loss UX bug: the user may close the app or overwrite data believing they have a backup. The fix is trivial: replace the empty catch with an error toast, matching the exact pattern already used by the JSON import at line 657–664.

## Current state

- `src/PortfolioManagerApp.jsx:625-634` — export handler with silent catch:

  ```jsx
  const handleExportJson = useCallback(async () => {
    try {
      const data = await exportPortfolioJson(portfolioId);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `portfolio-${portfolioId.trim()}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silently fail
    }
  }, [portfolioId]);
  ```

- `src/PortfolioManagerApp.jsx:657-664` — the import error handler (PATTERN TO MATCH):

  ```jsx
  } catch {
    pushToastRef.current?.({
      id: `import-json-err-${Date.now()}`,
      type: 'error',
      title: 'Import Failed',
      message: 'Could not restore portfolio from JSON. Check the file format.',
      duration: 5000,
    });
  }
  ```

- `pushToastRef` is already in scope — it's defined earlier in the component (line ~100–110 area) and used throughout for success/error toasts.

The repo convention for error toasts: use `pushToastRef.current?.()` with `type: 'error'`, a unique `id` using `Date.now()`, a short `title`, a user-facing `message`, and `duration: 5000`.

## Commands you will need

| Purpose        | Command                         | Expected on success |
| -------------- | ------------------------------- | ------------------- |
| Install        | `npm ci --no-fund --no-audit`   | exit 0              |
| Lint           | `npm run lint`                  | exit 0              |
| Typecheck      | `npm run verify:typecheck`      | exit 0              |
| Frontend tests | `npx vitest run src/__tests__/` | all pass            |

## Scope

**In scope**:

- `src/PortfolioManagerApp.jsx:632-634` — replace the empty catch block

**Out of scope**:

- `src/utils/api.js` — the `exportPortfolioJson` function itself; changing it is not needed
- Any other catch blocks in the app
- Adding a new test file (the existing test suite covers this via the component's test)

## Git workflow

- Branch: `advisor/002-silent-json-export-failure`
- Commit style: `fix: show error toast on JSON export failure` (follows conventional commits)

## Steps

### Step 1: Replace silent catch with error toast

In `src/PortfolioManagerApp.jsx`, replace lines 632–634:

```jsx
    } catch {
      // silently fail
    }
```

with:

```jsx
    } catch {
      pushToastRef.current?.({
        id: `export-json-err-${Date.now()}`,
        type: 'error',
        title: 'Export Failed',
        message: 'Could not export portfolio to JSON. Please try again.',
        duration: 5000,
      });
    }
```

The pattern matches the existing import error handler at line 657 exactly — same structure, same optional chaining on `pushToastRef.current`, same `type`, `duration`, and `Date.now()`-based id format.

**Verify**: `grep -A5 "catch" src/PortfolioManagerApp.jsx | grep -A5 "export-json-err"` → should show the new toast code (not `// silently fail`).

### Step 2: Run the full quality gate

**Verify**: `npm run lint && npm run verify:typecheck` → both exit 0 with no errors.

### Step 3: Run frontend tests

**Verify**: `npx vitest run src/__tests__/` → all 128 tests pass.

## Test plan

The existing test suite covers this component. To verify the fix manually:

- `npx vitest run src/__tests__/PortfolioManagerApp.integration.test.tsx` → passes
- The test file `src/__tests__/App.settingsPersistence.test.tsx` exercises the component's toast behavior pattern and should continue to pass.

No new tests are strictly required — this is a one-line UX fix matching an existing pattern. However, if adding a test:

- Add to `src/__tests__/PortfolioManagerApp.integration.test.tsx` following the existing pattern:
  - Mock `exportPortfolioJson` to reject
  - Render the component
  - Trigger export
  - Assert the error toast appears

## Done criteria

- [ ] `grep "silently fail" src/PortfolioManagerApp.jsx` returns no matches
- [ ] `grep "export-json-err" src/PortfolioManagerApp.jsx` returns at least 1 match
- [ ] `npm run lint` exits 0
- [ ] `npm run verify:typecheck` exits 0
- [ ] `npx vitest run` exits 0; all tests pass
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- The code at line 632 in `PortfolioManagerApp.jsx` doesn't match the excerpt (the codebase has drifted).
- `pushToastRef` is not defined or has a different name — verify its declaration matches the pattern used at line 657.
- Any test fails that was passing before the change.

## Maintenance notes

- The `pushToastRef` pattern is used in ~10 places across this file. All of them use `pushToastRef.current?.()`. If this pattern is ever refactored (e.g., switched to a context-based toast system), the export handler must be migrated along with the others.
- The `exportPortfolioJson` function from `src/utils/api.js` could also benefit from better error propagation — if it throws with structured error info, the toast message could be more specific. That's out of scope for this plan.

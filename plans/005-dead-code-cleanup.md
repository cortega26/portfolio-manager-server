# Plan 005: Dead code cleanup — config files, feature flags, security middleware remnants, stale docs

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md` — unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 21ff5b1..HEAD -- server/config.js server/config.ts src/lib/featureFlags.js shared/policy.js docs/reference/SECURITY.md`
> If any of these files changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `21ff5b1`, 2026-06-16

## Why this matters

The codebase has accumulated dead weight from three rounds of architectural change (Express→Fastify migration, removal of public HTTP security, feature flag experiments). This dead code misleads contributors (config options that do nothing), wastes CI time (lint/typecheck on dead files), and creates maintenance traps (config.ts must be kept in sync with config.js despite zero consumers). Removing it is zero-risk — every piece targeted here is confirmed unused at runtime — and reduces the cognitive surface of the codebase immediately.

## Current state

Four distinct dead-code clusters:

### 1. Dead file: `server/config.ts` (337 lines)

Zero imports anywhere in the codebase (confirmed via `grep -rn "config\.ts"`). It's a TypeScript reimplementation of `config.js` that no file imports. Every TS module that needs config imports `../config.js`.

- `server/config.ts:1-337` — full file to delete

### 2. Dead security config in `server/config.js`

`server/config.js:132-168,277-307` loads and returns brute-force, audit-log, and rate-limit configuration. These sections correspond to middleware (`bruteForce.js`, `auditLog.js`, rate limiters) that was removed during Phase A cleanup ("Seguridad HTTP pública REMOVIDA"). The values are loaded from env, computed, and included in the returned config object — but zero consumers read them.

Lines to remove:

- `server/config.js:132-140` — brute-force env var parsing
- `server/config.js:141-147` — audit-log env var parsing
- `server/config.js:148-168` — rate-limit env var parsing
- `server/config.js:277-307` — the `security: { auth, bruteForce, auditLog }` and `rateLimit` blocks in the returned config object

Note: `security.auth` (lines 278-281) IS still used — it contains `sessionToken` and `headerName`. Keep that section, remove only `bruteForce` and `auditLog` inside it.

### 3. Abandoned feature flags

`src/lib/featureFlags.js:19-20` defines two flags never consumed in production code:

```js
're设计.ledgerOpsCenter': false,
're设计.policyGuidance': false,
```

`src/lib/featureFlags.js:17` defines a flag always set to `true` but still checked at runtime:

```js
're设计.todayShell': true,
```

It's checked in `src/PortfolioManagerApp.jsx:749` — the `false` branch is dead code.

`shared/policy.js` exports `evaluatePolicy` and `DEFAULT_POLICY` — a 131-line policy evaluation engine. It's imported ONLY by `tests/re设计/policyEvaluator.test.js`. No route, service, or component calls it in production.

### 4. Stale SECURITY.md

`docs/reference/SECURITY.md` describes API key management, brute-force lockouts, audit logging, rate limiting, and incident-response playbooks for endpoints (`/api/security/stats`, `/api/security/events`) that were all removed. It instructs users to interact with infrastructure that no longer exists. This is worse than missing docs — it's actively misleading.

## Commands you will need

| Purpose                     | Command                                                                                                                                                                                          | Expected on success |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| Full test suite             | `npm test`                                                                                                                                                                                       | all pass            |
| Lint                        | `npm run lint`                                                                                                                                                                                   | exit 0              |
| Typecheck (both)            | `npm run verify:typecheck && npm run verify:typecheck:server`                                                                                                                                    | exit 0              |
| Verify no remaining imports | `grep -rn "config\.ts\|ledgerOpsCenter\|policyGuidance" server/ src/ shared/ --include="*.js" --include="*.ts" --include="*.jsx" --include="*.tsx" \| grep -v __tests__ \| grep -v node_modules` | no output           |

## Scope

**In scope**:

- `server/config.ts` — delete the file
- `server/config.js` — remove `bruteForce*`, `auditLog*`, `RATE_LIMIT_*`, `SECURITY_AUDIT_*` parsing; remove `security.bruteForce`, `security.auditLog`, `rateLimit` from returned config
- `src/lib/featureFlags.js` — remove `ledgerOpsCenter` and `policyGuidance` flags; remove `todayShell` flag
- `src/PortfolioManagerApp.jsx` — remove the `todayShell` flag check (line ~749), always render TodayTab
- `shared/policy.js` — remove unused exports (`evaluatePolicy`, `DEFAULT_POLICY`) OR add a comment marking them for future use
- `docs/reference/SECURITY.md` — replace with accurate desktop-app security description

**Out of scope**:

- `server/middleware/bruteForce.js`, `server/middleware/auditLog.js`, `server/security/eventsStore.js` — these files are already noted as "inert modules" in the status doc. Removing them would require updating any remaining imports. Leave them for a separate file-deletion pass.
- `server/config.ts`-specific types in `server/types/config.ts` — those are shared with `config.js` (which is the real consumer); do not touch them.
- `tests/re设计/policyEvaluator.test.js` — DO NOT DELETE. If `evaluatePolicy` is removed from `shared/policy.js`, this test will fail. Either: keep `evaluatePolicy` exported from `shared/policy.js` (mark as unused but keep), or remove the test too. PREFER keeping the function — it's tested, working code that may be useful later. Just remove the dead feature flag.

## Git workflow

- Branch: `advisor/005-dead-code-cleanup`
- Commit style: `chore: remove dead config, feature flags, and stale security docs`

## Steps

### Step 1: Delete `server/config.ts`

```bash
rm server/config.ts
```

**Verify**: `ls server/config.ts` → "No such file or directory". Then `npm run verify:typecheck:server` → exits 0 (confirms nothing imported it).

### Step 2: Remove dead security config from `server/config.js`

Remove the following blocks:

**Lines 132-140** (brute-force parsing):

```js
const bruteForceMaxAttempts = parseNumber(env.BRUTE_FORCE_MAX_ATTEMPTS, 5);
const bruteForceAttemptWindowSeconds = parseNumber(env.BRUTE_FORCE_ATTEMPT_WINDOW_SECONDS, 15 * 60);
const bruteForceLockoutSeconds = parseNumber(env.BRUTE_FORCE_LOCKOUT_SECONDS, 15 * 60);
const bruteForceMaxLockoutSeconds = parseNumber(env.BRUTE_FORCE_MAX_LOCKOUT_SECONDS, 60 * 60);
const bruteForceMultiplier = parseNumber(env.BRUTE_FORCE_LOCKOUT_MULTIPLIER, 2);
const bruteForceCheckPeriodSeconds = parseNumber(env.BRUTE_FORCE_CHECK_PERIOD, 60);
```

**Lines 141-147** (audit-log parsing):
The block reading `SECURITY_AUDIT_MAX_EVENTS` including the `Math.min`/`Math.max` wrapping.

**Lines 148-168** (rate-limit parsing):
All `RATE_LIMIT_*` parsing for general, portfolio, and prices rate limits.

**Lines 277-289** — from the returned config object, remove:

```js
bruteForce: {
  maxAttempts: bruteForceMaxAttempts,
  ...
},
auditLog: {
  maxEvents: auditLogMaxEvents,
},
```

**Lines 294-307** — remove the entire `rateLimit` block.

**Line 282** — UPDATE `security` to only contain `auth`:

```js
security: {
  auth: {
    sessionToken: sessionAuthToken,
    headerName: sessionAuthHeaderName,
  },
},
```

**Verify**: `grep -n "bruteForce\|auditLog\|rateLimit\|BRUTE_FORCE\|RATE_LIMIT\|SECURITY_AUDIT" server/config.js | grep -v "^\s*//"` → returns no matches (or only commented lines).

### Step 3: Clean up feature flags

**In `src/lib/featureFlags.js`**, remove lines 19-20 (`ledgerOpsCenter` and `policyGuidance`). Remove line 17 (`todayShell`). The file should have only:

```js
export const FLAG_DEFAULTS = {
  're设计.trustBadges': false,
};
```

**In `src/PortfolioManagerApp.jsx`**, find the `todayShell` flag check (around line 749, look for `getFlag(resolveFlags(), 're设计.todayShell')`) and remove the conditional. Always render `TodayTab`:

Search for the pattern:

```jsx
showTodayTab={getFlag(resolveFlags(), 're设计.todayShell')}
```

Replace with:

```jsx
showTodayTab={true}
```

Or simply remove the `showTodayTab` prop if it's always true and the component can default it.

**Verify**: `grep -rn "ledgerOpsCenter\|policyGuidance\|todayShell" src/ --include="*.js" --include="*.jsx"` → returns no matches (except possibly in `__tests__` if tests reference them — update those).

### Step 4: Update SECURITY.md

Replace `docs/reference/SECURITY.md` with a short, accurate description:

```markdown
# Security Model

Portfolio Manager Unified is a **local desktop application**. It runs entirely on
your machine with no public-facing network surface.

## Architecture

- **Loopback-only API**: The Fastify backend listens on `127.0.0.1` only. No
  external network access to the API is possible.
- **Session token**: A random 256-bit token is generated per application launch
  in the Electron main process. The renderer must present this token in every
  API request. The token never touches disk.
- **PIN-protected portfolios**: Each portfolio can be locked with a local PIN,
  hashed with `crypto.scrypt` and verified with timing-safe comparison. The PIN
  hash is stored in SQLite.
- **No public endpoints**: There is no authentication via API keys, no rate
  limiting, no brute-force protection, and no audit logging — because there is
  no public attack surface. These were removed in Phase A cleanup.

## What to do if you suspect a compromise

1. The session token is ephemeral — restart the application to invalidate it.
2. If a portfolio PIN may be compromised, change it from the Settings tab.
3. Review the SQLite database at `data/storage.sqlite` for unexpected
   transactions.
4. Check `~/.portfolio-manager-unified/` for any unexpected files.

## Reporting vulnerabilities

This is a personal desktop application. If you discover a security issue, please
open a GitHub issue or contact the maintainer directly.
```

**Verify**: `wc -l docs/reference/SECURITY.md` → should be ~40 lines (down from ~150+).

### Step 5: Run the full quality gate

**Verify**: `npm test && npm run lint && npm run verify:typecheck && npm run verify:typecheck:server` → all exit 0.

## Test plan

- Update any tests that reference removed flags (`ledgerOpsCenter`, `policyGuidance`, `todayShell`). Search: `grep -rn "ledgerOpsCenter\|policyGuidance\|todayShell" src/__tests__/ tests/`.
- If `policyEvaluator.test.js` imports from `shared/policy.js` and the exports were removed, restore the exports (keep the functions, just remove the dead flag).
- **Verification**: `npm test` → all pass. New failures from flag removal should be fixed by updating test references, not by restoring dead code.

## Done criteria

- [ ] `server/config.ts` no longer exists
- [ ] `grep -n "bruteForce\|auditLog\|RATE_LIMIT\|SECURITY_AUDIT" server/config.js | grep -v "^\\s*//"` returns no results
- [ ] `grep -rn "ledgerOpsCenter\|policyGuidance\|todayShell" src/ --include="*.js" --include="*.jsx"` returns no results (excluding `__tests__` if updated)
- [ ] `docs/reference/SECURITY.md` is updated and accurate
- [ ] `npm test` exits 0; all tests pass
- [ ] `npm run lint` exits 0
- [ ] `npm run verify:typecheck && npm run verify:typecheck:server` exits 0
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- `grep -rn "from.*config\.ts\|require.*config\.ts\|import.*config\.ts" server/ src/` returns any match — the file IS imported somewhere; do not delete.
- Removing security config from `config.js` causes a test failure — check whether any test imports and destructures those fields from `loadConfig()`.
- Removing feature flags causes a component crash — check whether any component reads the removed flags without a default.

## Maintenance notes

- The `bruteForce.js`, `auditLog.js`, and `eventsStore.js` files still exist on disk as inert modules. A separate file-deletion PR could remove them along with updating any stale imports in test files. This is low-priority.
- The `shared/policy.js` evaluator is genuinely useful code; it was just never wired in. Plan 012 (review-first shell) may use it. For now, keep the exports but remove the dead feature flag.
- If new feature flags are added in the future, ensure they have a defined rollout plan and cleanup trigger (e.g., "remove this flag after 2 releases of being default-true").

# portfolio-manager-server — **Speed Up Codex Runs** (Fast vs Heavy lanes)

**Owner:** @cortega26  
**Repo:** `github.com/cortega26/portfolio-manager-server`  
**Purpose:** Make every AI/Codex task finish in minutes (often < 5) instead of 30+ by separating a **FAST lane** (default) from a **HEAVY lane** (on demand), eliminating redundant work, and keeping expensive tools off the default path.

> Paste this file’s path in your Codex prompt: “**Read `codex-speedup-playbook.md` and implement all steps.**”  
> Codex MUST follow the acceptance criteria and report results at the end.

---

## TL;DR — What changes

- **Default to FAST lane.** Only run the **HEAVY lane** when I explicitly say **“HEAVY”** or **“run full CI”**.  
- **Single test run for coverage.** Don’t run “tests” and then “tests-with-coverage” again. One run only.  
- **Mutation testing (Stryker)** stays **off by default**; use `--incremental` or “mutate just edited files” when needed.  
- **Scanners (gitleaks, npm audit)** only in HEAVY lane or CI, not on every local/dev run.  
- **Skip network calls in tests** by default; add a guard `NO_NETWORK_TESTS=1` to avoid slow/flaky runs.

---

## Guardrails for Codex (read carefully)

1) **Do not** run heavy tools unless the prompt contains the word **HEAVY** (uppercase) or asks to “run full CI.”  
2) Prefer `npm ci --no-fund --no-audit` over `npm install`.  
3) Detect the test runner from `package.json`:  
   - If **Vitest**: use `vitest run` and its built‑in coverage flags.  
   - If **Jest**: use `jest` and its built‑in coverage flags.  
4) **Never** run tests twice for coverage. Use a **single run** that also outputs coverage.  
5) Maintain existing functionality; only optimize scripts/workflow and test configuration.

---

## Step 0 — Branch + dry run

- Create a branch: `perf/codex-fast-heavy-lanes`  
- Print detected runner (Vitest vs Jest) and key files: `package.json`, any `stryker.*` config, `.github/workflows/*`.

**Deliverable:** short log block with detected toolchain and planned edits.

---

## Step 1 — Update `package.json` scripts (FAST lane + HEAVY lane)

> **Goal:** clearly separate fast commands from heavy commands. Keep existing scripts unless they’re redundant; add/fix the ones below.

### 1A) If the repo uses **Vitest**
Add or update these scripts:

```json
{
  "scripts": {
    "lint": "eslint . --max-warnings=0",

    // FAST lane (default)
    "test": "vitest run",
    "test:fast": "vitest run --coverage=false --reporter=dot",

    // Single-run coverage (no double testing)
    "test:coverage": "vitest run --coverage --coverage.reporter=text-summary --coverage.reporter=lcov",

    // HEAVY lane tools (opt-in only)
    "leaks:repo": "gitleaks detect --no-banner",
    "audit:quick": "npm audit --audit-level=critical || true",

    // Mutation testing (opt-in, incremental when possible)
    "mutate": "stryker run",
    "mutate:changed": "stryker run --incremental"
  }
}
```

### 1B) If the repo uses **Jest**
Add or update these scripts:

```json
{
  "scripts": {
    "lint": "eslint . --max-warnings=0",

    // FAST lane (default)
    "test": "jest",
    "test:fast": "jest --reporters=default",

    // Single-run coverage (no double testing)
    "test:coverage": "jest --coverage --coverageReporters=text-summary --coverageReporters=lcov",

    // HEAVY lane tools (opt-in only)
    "leaks:repo": "gitleaks detect --no-banner",
    "audit:quick": "npm audit --audit-level=critical || true",

    // Mutation testing (opt-in, incremental when possible)
    "mutate": "stryker run",
    "mutate:changed": "stryker run --incremental"
  }
}
```

**Notes**
- Keep the existing `test` script working; introduce `test:fast` for the quickest iteration.  
- If some scripts already exist, **adjust** rather than duplicate.  
- Don’t add `postinstall` hooks that download heavy tooling; ensure no heavy job runs implicitly.

---

## Step 2 — “FAST” and “HEAVY” execution contracts

Add the following **contract** to `AGENTS.md` (create if missing) at the top. Make FAST the **default** for all Codex tasks.

```md
## Execution Modes

**FAST lane (default)**
- Install: `npm ci --no-fund --no-audit`
- Lint: `npm run lint`
- Tests: `npm run test:fast`
- Do **not** run coverage, mutation testing, gitleaks, or npm audit unless explicitly requested.

**HEAVY lane (opt-in)**
- Coverage (single run): `npm run test:coverage`
- Secret scan: `npm run leaks:repo` (if gitleaks is available)
- Dependency audit: `npm run audit:quick`
- Mutation testing: `npm run mutate:changed` (or narrow scope with `--mutate`)
```

Also add this **prelude** you can paste into future prompts:

```md
**Constraints for this task**
- Use FAST lane only unless I say **HEAVY**.
- If you need coverage, run `npm run test:coverage` (single run; don’t run tests twice).
- Do not run gitleaks, npm audit, or mutation unless I say **HEAVY**.
```

---

## Step 3 — CI: keep strict, avoid redundant work

Open `.github/workflows/*.yml` and ensure **tests+coverage** happen in **one** step only. Example (Node 20 + npm cache):

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: '20'
    cache: 'npm'

- run: npm ci
- run: npm run lint
- run: npm run test:coverage    # single run for tests + coverage

# Heavy checks in CI can remain (optional)
- run: npx gitleaks detect --no-banner
- run: npm audit --audit-level=moderate
```

- Remove any separate “Run tests” duplicates if a coverage run also executes tests.  
- Keep caching as-is or improve it; no need to alter cache keys.

---

## Step 4 — Mutation testing: make it developer-friendly

- Ensure mutation tasks are **not part of default** dev scripts.  
- Use incremental mode where possible: `npm run mutate:changed`.  
- To narrow scope further during iteration, allow per-file mutations, e.g.:  
  `npx stryker run --mutate "src/path/to/just-edited-file.{js,ts}"`  
- Document these in `AGENTS.md` under **HEAVY lane**.

---

## Step 5 — Tests that hit the network

- Introduce an env guard in tests that perform live HTTP calls:  
  - If `process.env.NO_NETWORK_TESTS === '1'`, skip or mock those tests.  
- Add a default to FAST lane execution: `NO_NETWORK_TESTS=1 npm run test:fast` (optional).  
- Prefer mocks (`nock`, `msw`) for determinism and speed.

---

## Step 6 — Sanity checks (postinstall & friends)

- Verify `package.json` has no **heavy** `postinstall` that downloads browsers or triggers scans/builds.  
- Keep `prepare`/`prepublish` lean; nothing that slows every `npm ci` in a fresh environment.

---

## Validation plan (Codex must do this)

1) **Before vs After timings**:  
   - Run once “as-is” (baseline), then after changes run FAST and HEAVY lanes.  
   - Report wall-clock for: `npm ci`, `npm run test:fast`, `npm run test:coverage`.  
2) **Functional equivalence**: all tests green; same coverage threshold as before (or better).  
3) **No heavy-by-default**: prove that default `npm test` and `npm run test:fast` do not trigger mutation, gitleaks, or npm audit.  
4) **CI OK**: open a PR with the changes; show CI summary is green.

**Done when**
- Dev iteration (FAST lane) is ≤ 3–5 min cold, typically ≤ 2 min warm.  
- Coverage is produced in a **single** run when requested.  
- Mutation & scanners are explicit-only and not run during normal dev tasks.

---

## Example PR layout

- **Branch:** `perf/codex-fast-heavy-lanes`  
- **Commits (suggested):**
  - `chore(scripts): add fast & coverage variants; move scanners to heavy lane`  
  - `chore(ci): single-run coverage; remove duplicate test step`  
  - `docs(agents): document FAST vs HEAVY modes and constraints`  
  - `test(net): add NO_NETWORK_TESTS guard for live HTTP tests`

**Include**: short `BEFORE/AFTER` timing table in PR description.

---

## Appendix — Helpful snippets

**Skip network tests (Jest example)**
```ts
const skipNet = process.env.NO_NETWORK_TESTS === '1';
(skipNet ? describe.skip : describe)('networked suite', () => {
  it('fetches data', async () => { /* ... */ });
});
```

**Skip network tests (Vitest example)**
```ts
import { describe, it } from 'vitest';

const skipNet = process.env.NO_NETWORK_TESTS === '1';
(skipNet ? describe.skip : describe)('networked suite', () => {
  it('fetches data', async () => { /* ... */ });
});
```

**Stryker per-file**
```bash
npx stryker run --mutate "src/path/to/just-edited-file.ts"
```

**Prompt prelude (to paste before most Codex tasks)**
```md
**Constraints**
- Use FAST lane: `npm ci --no-fund --no-audit && npm run lint && npm run test:fast`
- If coverage needed: `npm run test:coverage` (single run).
- Do NOT run gitleaks, npm audit, or mutation unless I say **HEAVY**.
```

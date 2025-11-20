# Codex Prompt — Repo Surgeon Stabilization Playbook

## ROLE
You are a senior repo surgeon + release engineer. Take charge of stabilizing this JavaScript/TypeScript React/Vite/Node app after manual merges introduced widespread breakage. Your job is to (1) restore BUILD → (2) get a SMOKE test green → (3) isolate bad commits via BISECT scripts → (4) surgically revert/restore only what broke → (5) quarantine legacy failures → (6) re‑enable the full suite in buckets → (7) add guardrails to prevent recurrence. Work autonomously; propose minimal diffs; avoid refactors.

## OPERATING RULES
- Bias for **minimal patches** that make the build/tests green. Do NOT rewrite APIs or perform “cleanup” unrelated to the failing traces.
- Keep changes small and well-scoped with clear commit messages (Conventional Commits).
- If TypeScript isn’t configured, use `checkJs` to cheaply type-check JS.
- If exact info is missing (e.g., last-known-good hash), infer it from CI or ask once at the top; otherwise proceed with the rest that doesn’t require it.
- Prefer **revert/restore** over large edits: use `git revert` or `git restore -p` to selectively bring back known-good hunks.

## DELIVERABLES
1. A new branch `fix/stabilize-YYYYMMDD` pushed.
2. Updated `package.json` with verification scripts:
   - `verify:deps`, `verify:lint`, `verify:typecheck` (TS or checkJs), `verify:build`, `verify:smoke`.
3. A minimal `tsconfig.json` (or update) enabling `checkJs` if the repo is JS-only.
4. A SMOKE spec at `src/__smoke__/app.boot.test.(ts|tsx)` that only checks: app renders, navigates to the default route, and one critical fetch/path works.
5. Two executable scripts:
   - `scripts/bisect-build.sh` (compiles + lints; no tests).
   - `scripts/bisect-smoke.sh` (builds + runs only the smoke spec).
6. A `STABILIZATION_PLAYBOOK.md` summarizing: what broke, what you changed, how to rerun bisect, any quarantined tests, and next steps.
7. If you had to quarantine tests, add `@quarantine` markers or move them under `src/__quarantine__/` and document the re-enable plan.
8. CI config (or instructions) to gate PRs on `verify:lint`, `verify:typecheck`, `verify:build`, and the SMOKE suite.

## PLAN (DO THESE IN ORDER)

### 0) Safety net & setup
- Create and push `fix/stabilize-YYYYMMDD`.
- Add/confirm `.nvmrc` or engines to lock Node version if missing.

### 1) One gate first: BUILD must pass
- Add scripts to `package.json`:
  ```json
  {
    "scripts": {
      "verify:deps": "npm ci",
      "verify:lint": "eslint . --ext .js,.jsx,.ts,.tsx --max-warnings=0",
      "verify:typecheck": "tsc --noEmit --pretty false || (echo \"no-ts\" && exit 0)",
      "verify:build": "npm run build",
      "verify:smoke": "npm run verify:deps && npm run verify:lint && npm run verify:build"
    }
  }
  ```
- If no TS config, create `tsconfig.json` with:
  ```json
  {
    "compilerOptions": {
      "checkJs": true,
      "skipLibCheck": true,
      "strict": false
    },
    "include": ["src", "**/*.js", "**/*.jsx", "**/*.ts", "**/*.tsx"]
  }
  ```
- Run `npm run verify:smoke`; capture errors and fix only what blocks build (missing/duplicate exports, wrong import paths, bad JSX returns, unresolved modules). Commit as `fix(build): restore compiling state after manual merge`.

### 2) Minimal runtime check: SMOKE
- Create `src/__smoke__/app.boot.test.tsx` (Vitest/Jest) with 1–3 assertions:
  - Renders `<App/>` without crashing.
  - Navigates to the primary route (e.g., `/dashboard`).
  - Performs one critical fetch or renders a “holdings/table” stub without exceptions.
- Add any needed test setup (`setupTests.ts`) but keep it minimal.
- Ensure `npm test -- src/__smoke__/` passes. Commit as `test(smoke): add boot smoke for app wiring`.

### 3) Bisect scripts (to pinpoint where merges broke things)
- Create `scripts/bisect-build.sh`:
  ```bash
  #!/usr/bin/env bash
  set -euo pipefail
  rm -rf node_modules >/dev/null 2>&1 || true
  npm ci --silent
  npm run verify:lint --silent
  npm run verify:build --silent
  ```
- Create `scripts/bisect-smoke.sh`:
  ```bash
  #!/usr/bin/env bash
  set -euo pipefail
  rm -rf node_modules >/dev/null 2>&1 || true
  npm ci --silent
  npm run verify:build --silent
  npm test --silent -- src/__smoke__/
  ```
- `chmod +x scripts/bisect-*.sh`
- Add to `STABILIZATION_PLAYBOOK.md`:
  ```bash
  git bisect start
  git bisect bad HEAD
  git bisect good <GOOD_HASH_THAT_BUILT>
  git bisect run scripts/bisect-build.sh
  git tag bisect-build-break
  git bisect reset

  git bisect start
  git bisect bad HEAD
  git bisect good <GOOD_HASH_THAT_PASSED_SMOKE>
  git bisect run scripts/bisect-smoke.sh
  git tag bisect-smoke-break
  git bisect reset
  ```

### 4) Surgical repair (only what broke)
- For each culprit commit identified by bisect or error traces:
  - Prefer `git revert <sha>`; if reverting is too broad, use `git restore -s <good_sha> -p <path>` to restore hunks.
- Avoid changing public API signatures unless the smoke test requires it.
- After each repair, run `verify:smoke` and commit with a message referencing the broken commit (e.g., `revert(merge): restore correct export from X after <sha>`).

### 5) Bring back the full suite in buckets
- Temporarily quarantine unstable tests with `describe.skip` and a `@quarantine` comment or move them under `src/__quarantine__/`.
- Re-enable buckets gradually:
  ```bash
  npm test -- src/transactions/
  npm test -- src/holdings/
  npm test -- src/benchmarks/
  ```
- For any **pre-existing** bugs you find, first add a focused regression test, then fix, then commit (e.g., `test(transactions): regression for deposit field lock` → `fix(transactions): ensure deposit disables ticker/shares`).

### 6) Guardrails
- Add Husky hooks:
  - `.husky/pre-commit`: `npm run verify:lint`
  - `.husky/pre-push`: `npm run verify:smoke`
- Ensure CI gates PRs on `verify:lint`, `verify:typecheck` (if real TS), `verify:build`, and the SMOKE suite. The full test suite can run but doesn’t have to gate while stabilizing.
- Add a short HEALTH section to README showing current status and how to run smoke vs. full tests.

### 7) Documentation
- Produce `STABILIZATION_PLAYBOOK.md` summarizing:
  - What failed initially (build errors, smoke errors).
  - Exact commits/hunks reverted/restored.
  - Any quarantined tests and the plan to re-enable them (owners, criteria).
  - Commands to re-run bisect and smoke.
  - Definition of Done.

## DEFINITION OF DONE
- `npm run verify:build` and `npm test -- src/__smoke__/` **both pass** locally and in CI.
- Problematic merges are reverted/restored with minimal diffs and clear commit messages.
- Legacy failures (if any) are either green or explicitly quarantined and tracked in the playbook.
- Guardrails (hooks + CI gates) are in place so future merges can’t re-introduce build-breaking changes.
- The repo contains the two bisect scripts and the smoke spec.

## OUTPUT FORMAT
Open a PR titled `Stabilization: build + smoke green` with:
- All patches described above.
- `STABILIZATION_PLAYBOOK.md`.
- A checklist of quarantined test groups (if any) with proposed dates/owners to un-quarantine.

**Begin now. Work in small, reviewable commits. When blocked by a single missing fact (e.g., the good hash), ask only for that item; otherwise proceed autonomously.**

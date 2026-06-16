# Plan 001: Security hardening — tighten CSP for production builds and disable source maps

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md` — unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 21ff5b1..HEAD -- vite.config.js .env`
> If any of these files changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `21ff5b1`, 2026-06-16

## Why this matters

The production Electron build currently embeds a relaxed Content Security Policy from `.env` that allows `'unsafe-eval'`, `'wasm-unsafe-eval'`, and `connect-src` to external domains (`tooltician.com`). This weakens XSS protection: any compromise of the renderer (via malicious CSV import, dependency exploit, etc.) could execute arbitrary code and exfiltrate portfolio financial data to external servers. Separately, `sourcemap: true` in the production build exposes the full frontend source code in DevTools, making vulnerability discovery trivial. Both fixes are one-line changes in `vite.config.js` with zero behavioral impact on the application.

## Current state

- `vite.config.js:23-25` — loads `VITE_APP_CSP` from env (which reads `.env`):
  ```js
  export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    const appCsp = env.VITE_APP_CSP || process.env.VITE_APP_CSP || DEFAULT_APP_CSP;
  ```
- `.env:101` — defines the relaxed CSP with `unsafe-eval` and external `connect-src`:
  ```
  VITE_APP_CSP=default-src 'self'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; ... connect-src 'self' https://www.tooltician.com https://api.tooltician.com; ...
  ```
- `vite.config.js:11-21` — the hardened `DEFAULT_APP_CSP` constant (already correct, but never used in production because `.env` overrides it):
  ```js
  const DEFAULT_APP_CSP = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  ```
- `vite.config.js:55` — unconditional source maps in production:
  ```js
  build: {
    sourcemap: true,
  ```
- `scripts/electron-dev.mjs:57` — already calls `buildElectronDevCsp()` which sets `VITE_APP_CSP` for dev only. Dev builds are not affected by this plan.

Relevant conventions: The project follows a pattern where `DEFAULT_APP_CSP` is the secure baseline and `VITE_APP_CSP` is the override. The script `scripts/electron-dev.mjs` already demonstrates setting `VITE_APP_CSP` for development-only purposes.

## Commands you will need

| Purpose                   | Command                                 | Expected on success     |
| ------------------------- | --------------------------------------- | ----------------------- |
| Build                     | `npm run build`                         | exit 0, `dist/` created |
| Lint                      | `npm run lint`                          | exit 0                  |
| Test                      | `npm test`                              | all pass                |
| Check CSP in build output | `grep -c "unsafe-eval" dist/index.html` | `0`                     |

## Scope

**In scope**:

- `vite.config.js` — change sourcemap to conditional, change CSP resolution to prefer DEFAULT_APP_CSP in production
- `.env` — remove `VITE_APP_CSP` line (or add comment explaining it's dev-only)

**Out of scope**:

- `index.html` — the `%VITE_APP_CSP%` placeholder is correct; do not change it
- `scripts/electron-dev.mjs` — the dev CSP injection there is correct and needed for HMR
- Any changes to Helmet CSP in `server/app.fastify.ts` — that's the API server CSP, unrelated
- Any other `.env` variables

## Git workflow

- Branch: `advisor/001-security-build-hardening`
- Commit style: `fix: tighten CSP for production builds and disable source maps` (follows conventional commits pattern observed in `git log`)

## Steps

### Step 1: Make source maps conditional on dev mode

In `vite.config.js:55`, change `sourcemap: true` to only enable source maps in development mode. The `defineConfig` callback already receives `{ mode }`:

```js
build: {
  sourcemap: mode === 'development',
```

**Verify**: `npm run build && ls dist/assets/*.map 2>&1` → should print "No such file or directory" (no `.map` files in production build).

### Step 2: Remove VITE_APP_CSP from .env

Remove or comment out line 101 in `.env`. The `vite.config.js` fallback chain already uses `DEFAULT_APP_CSP` when `VITE_APP_CSP` is not set:

```js
const appCsp = env.VITE_APP_CSP || process.env.VITE_APP_CSP || DEFAULT_APP_CSP;
```

If you want to keep it for reference, change it to a comment:

```
# VITE_APP_CSP is set automatically by scripts/electron-dev.mjs for development.
# For production, the hardened DEFAULT_APP_CSP in vite.config.js is used.
# VITE_APP_CSP=...
```

**Verify**: `grep "VITE_APP_CSP=" .env` → should return no uncommented match (or only comment lines).

### Step 3: Verify production build uses hardened CSP

**Verify**: `npm run build && grep -o "default-src 'self'; script-src 'self';" dist/index.html` → should find the hardened CSP in the built HTML. Also `grep "unsafe-eval" dist/index.html` → should return no matches.

## Test plan

No new tests needed — this is a build configuration change. The existing test suite verifies the app still works:

- `npm test` → all pass (confirms the app functions correctly after the build config change)
- Manual verification: `npm run build && grep "unsafe-eval" dist/index.html` → exits 1 (no match)
- Manual verification: `npm run build && grep "tooltician.com" dist/index.html` → exits 1 (no match)

## Done criteria

- [ ] `npm run build` exits 0
- [ ] `grep -c "unsafe-eval" dist/index.html` returns `0`
- [ ] `grep -c "tooltician.com" dist/index.html` returns `0`
- [ ] `ls dist/assets/*.js.map 2>&1` fails (no source maps in production build)
- [ ] `npm run lint` exits 0
- [ ] `npm test` exits 0; all tests pass
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- The code at the locations in "Current state" doesn't match the excerpts (the codebase has drifted).
- `npm run build` fails after the changes — the CSP change should not affect the build.
- The dev server (`npm run dev`) no longer works — the CSP change must not break HMR.
- Any test fails that was passing before the change.

## Maintenance notes

- If `VITE_APP_CSP` is re-added to `.env` in the future, it will again override `DEFAULT_APP_CSP` for production builds. The real fix is in `vite.config.js` — consider adding a mode check there too: `const appCsp = mode === 'production' ? DEFAULT_APP_CSP : (env.VITE_APP_CSP || process.env.VITE_APP_CSP || DEFAULT_APP_CSP)`.
- If new external domains need to be whitelisted (e.g., a new price provider), add them to `electron-dev.mjs` for development and update `DEFAULT_APP_CSP` for production.
- The `'unsafe-inline'` for `style-src` is required by Tailwind CSS and is expected.

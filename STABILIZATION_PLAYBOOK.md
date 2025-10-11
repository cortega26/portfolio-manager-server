# Stabilization Playbook — October 2025

## Overview
Manual merges on `main` left the repository without a consistent build/smoke gate. This playbook
captures the guardrails required to keep the build green, the smoke test definition, and the
bisect automation for isolating regressions.

## What Broke
- Build scripts were missing verification entrypoints, so CI could not gate merges consistently.
- There was no TypeScript/`checkJs` coverage, allowing type regressions to slip in unnoticed.
- The project lacked a deterministic smoke test, leaving router regressions undetected.

## Remediations
1. Added `verify:*` npm scripts plus Husky hooks to ensure lint, typecheck, build, and smoke checks run locally.
2. Introduced a minimal `tsconfig.json` with `checkJs` so `tsc --noEmit` validates `.js`/`.jsx` sources alongside Vitest `.ts` files.
3. Authored `src/__smoke__/app.boot.test.tsx` covering the default dashboard route and admin guard flow.
4. Delivered automated bisect helpers under `scripts/` for build-only and smoke test triage.
5. Documented the workflow (this file + README health section) and synced the hardening scoreboard.

## Smoke Test Definition
Run only the deterministic boot check:

```bash
npm test -- src/__smoke__/
```

The suite asserts:
- `<App />` renders under the I18n provider and default route shows the dashboard panel.
- Admin routes remain guarded when invite tokens are configured, surfacing the return link.

## Bisect Automation
```
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

## Quarantined Tests
- None. The existing Vitest suites remain enabled.

## Next Steps
- Promote `npm run verify:smoke` to the default PR gate in CI (builds, lint, typecheck, smoke).
- Resolve the pre-existing ESLint failures in `server/finance/cash.js` and legacy `.tsx` test
  harnesses so `npm run verify:lint` can complete successfully.
- Once the suite remains green for 2 consecutive weeks, evaluate re-enabling the full coverage run
  as a blocking check.

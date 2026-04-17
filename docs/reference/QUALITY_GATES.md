# Quality Gates

This document is the stable contract for what quality gates are actually enforced
today in the repository.

Use this file to answer two questions quickly:

1. What must stay green before a change is considered healthy?
2. What does CI currently enforce versus what is still an aspiration?

## Enforced Today

| Gate                    | Command                    | Enforced in CI                       | Purpose                                                                          |
| ----------------------- | -------------------------- | ------------------------------------ | -------------------------------------------------------------------------------- |
| Bootstrap assumptions   | `npm run doctor`           | Yes, via `npm run verify:docs`       | Verifies required files, runtime assumptions, and canonical entrypoints exist.   |
| Documentation contracts | `npm run docs:check`       | Yes, via `npm run verify:docs`       | Fails when active docs reference missing scripts or stale implementation claims. |
| Quality-gate contract   | `npm run quality:gates`    | Yes, via `npm run verify:docs`       | Verifies that this contract, package scripts, and CI workflow stay aligned.      |
| Lint                    | `npm run verify:lint`      | Yes, via `npm run verify:smoke`      | Runs ESLint with zero warnings allowed.                                          |
| Type compatibility      | `npm run verify:typecheck` | Yes, via `npm run verify:smoke`      | Runs the repo TypeScript compatibility pass.                                     |
| Buildability            | `npm run verify:build`     | Yes, via `npm run verify:smoke`      | Confirms the renderer build still completes.                                     |
| Smoke boot              | `npm run smoke:test`       | Yes, via `npm run verify:smoke`      | Confirms the app shell still mounts.                                             |
| Baseline tests          | `npm test`                 | Indirectly, split across CI commands | Runs the default local baseline: shuffled `node:test` plus Vitest.               |
| Frontend coverage run   | `npm run test:coverage`    | Yes                                  | Produces the current Vitest coverage artifact.                                   |

## Observed Baseline

Baseline last verified locally on `2026-04-16`:

- `npm run test:node`: `341` pass, `0` fail, `1` skip
- `vitest run`: `83` pass, `0` fail
- `npm run test:coverage` summary from the current suite:
  - Statements: `57.29%`
  - Branches: `68.22%`
  - Functions: `71.02%`
  - Lines: `57.29%`

These numbers are an observed snapshot, not a hard gate.
If the suite intentionally grows, update this section in the same change.

## Not Enforced Yet

The repo has goals that matter, but they are not currently hard CI gates:

- repository-wide coverage thresholds above the current baseline
- touched-files coverage thresholds
- zero-stderr test output across every suite
- automatic failure on all known third-party chart warnings during test rendering

Track these as improvement targets until the codebase and tooling can sustain them
without causing noisy false failures.

## CI Workflow Contract

The canonical CI workflow at `.github/workflows/ci.yml` must include these commands:

- `npm run verify:docs`
- `npm run verify:smoke`
- `npm run test:coverage`

If CI changes, update this file and `scripts/check-quality-gates.mjs` in the same
change.

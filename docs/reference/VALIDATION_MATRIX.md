# Validation Matrix

This document is the stable contract for what each validation command is for.
It defines scope and intent, not the current pass/fail state of a given checkout.

Runtime health belongs in CI, local command output, or `context/runtime/ACTIVE_TASK.md`
when a specific incident is active.

| Command                    | Scope              | Contract                                                                                          |
| -------------------------- | ------------------ | ------------------------------------------------------------------------------------------------- |
| `npm run doctor`           | bootstrap          | Verifies that the local checkout contains the files and runtime assumptions needed to start work. |
| `npm run docs:check`       | docs               | Fails when active docs reference missing npm scripts or known stale implementation claims.        |
| `npm run quality:gates`    | docs + CI contract | Verifies that enforced quality-gate docs, package scripts, and CI workflow stay aligned.          |
| `npm run verify:docs`      | bootstrap + docs   | Runs the doctor, doc contract checks, and quality-gate contract together.                         |
| `npm run lint`             | repo               | ESLint over the repository with zero warnings allowed.                                            |
| `npm run format:check`     | repo               | Confirms Prettier formatting without modifying files.                                             |
| `npm run verify:typecheck` | types              | Runs the strict TypeScript compatibility pass defined by `tsconfig.typecheck.json`.               |
| `npm run test:node`        | backend + shared   | Runs the shuffled `node:test` harness through `tools/run-tests.mjs`.                              |
| `npm run test:fast`        | frontend           | Runs the fast Vitest suite without coverage for quick feedback.                                   |
| `npm test`                 | baseline           | Runs the default repository test baseline: `test:node` plus `vitest run`.                         |
| `npm run test:coverage`    | frontend coverage  | Runs Vitest with text-summary and lcov coverage output.                                           |
| `npm run test:e2e`         | browser workflow   | Runs Playwright end-to-end coverage from `tests/e2e/`.                                            |
| `npm run test:perf`        | performance        | Runs the synthetic performance harness under `tools/perf/`.                                       |
| `npm run mutate:changed`   | mutation           | Runs incremental mutation testing through Stryker.                                                |
| `npm run electron:smoke`   | desktop runtime    | Builds the app and verifies the Electron shell can boot in smoke mode.                            |

## Notes

- `npm test` is the minimum required validation after relevant code changes unless the baseline is already broken.
- `npm run verify:smoke` is the heavier pre-push gate for buildable desktop changes.
- If a new validation command becomes part of the working agreement, add it here in the same change.

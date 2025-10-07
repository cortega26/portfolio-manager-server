# Testing Strategy Guide

This guide documents how the portfolio manager project validates quality across unit, integration, property, and mutation testing. All contributors must follow these practices for every change that lands on `main`.

## Goals and Quality Gates

- **Global coverage:** ≥ 80% statements/lines across the repository on every test run.
- **Touched files coverage:** ≥ 90% statements/lines for any file modified in a pull request.
- **Branch coverage:** ≥ 70% for critical control paths (enforced via Vitest configuration).
- **Zero tolerance for noisy logs:** Any `console.warn`/`console.error` emitted during tests fails the run. Fix the underlying issue instead of muting output.
- **Deterministic reproducibility:** Runs must be reproducible via `TEST_SHUFFLE_SEED` and Fast-Check seeds captured in CI logs.

Coverage thresholds are enforced through `c8`/Vitest reporters in CI. Pull requests that lower coverage or introduce warnings must not merge.

## Test Layers

### Unit Tests

Unit suites cover pure utilities, React hooks, and Express middleware in isolation.

- Prefer lightweight factories over fixtures; keep execution deterministic.
- Mock network and filesystem boundaries with `vi.mock` to avoid non-deterministic behavior.
- Keep functions short (≤ 80 LOC) and assert both success and failure paths.

### Integration Tests

Integration suites exercise complete workflows:

- `server/__tests__/integration.test.js` drives REST endpoints end-to-end against the Express app with in-memory persistence.
- Frontend integration tests under `src/__tests__` mount components with React Testing Library to validate user flows.
- Contract tests ensure OpenAPI parity by loading [`docs/openapi.yaml`](openapi.yaml) directly.

### Property-Based Tests

Property testing uses [`fast-check`](https://github.com/dubzzz/fast-check) to validate invariants across broad input spaces.

- ROI, benchmark tracking, and cash accrual modules provide property harnesses under `server/__tests__` and `src/__tests__`.
- Seeds derive from `TEST_SHUFFLE_SEED` to keep counterexamples reproducible. Override via `FC_SEED` and increase executions with `FC_RUNS` when hardening.
- Minimize shrink noise by constraining arbitraries to domain-valid data (e.g., bounded trade amounts, sorted timestamps when required).

## Mutation Testing

Mutation testing is powered by [StrykerJS](https://stryker-mutator.io) (`stryker.conf.json`).

- Targeted at ROI math, benchmark parity, and cash accrual modules.
- Excludes slow UI suites to keep runtime manageable.
- Use before shipping substantial finance or validation changes to ensure properties and unit tests kill mutants.
- Mutation score must remain ≥ 70% for the targeted packages; investigate surviving mutants immediately.

Run mutations locally with:

```bash
npm run test:mutation
```

Review `reports/mutation/mutation.html` for surviving mutants and update assertions accordingly.

## Stress and Order Sensitivity Testing

`npm run test:stress` executes the full Vitest suite five consecutive times without coverage. This surfaces hidden order dependencies and race conditions. Ensure the command finishes cleanly before merging large refactors or flaky-test fixes.

## Console Warning Policy

Tests fail fast on console warnings/errors via `setupTests` hooks (`server/__tests__/setup/global.js` and `src/setupTests.ts`). When third-party packages emit unavoidable warnings, isolate them with targeted spies and document the rationale inline. Never mute project warnings globally.

## Commands Reference

Use the following commands during local development and CI:

| Command | Purpose |
| --- | --- |
| `npm test` | Runs the Vitest suite once with coverage enforcement, warning promotion, and deterministic shuffling. |
| `npm run test:stress` | Executes the suite five times without coverage to detect flakiness. |
| `npm run test:mutation` | Invokes StrykerJS against targeted math modules and reports the mutation score. |

For strict deprecation/warning checks, run:

```bash
NODE_OPTIONS="--trace-warnings --trace-deprecation --throw-deprecation" npm test -- --coverage
```

Document seeds and command outputs in PR descriptions to aid reproducibility.

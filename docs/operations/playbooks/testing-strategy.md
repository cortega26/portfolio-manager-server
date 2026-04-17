# Testing Strategy Guide

This guide documents how the portfolio manager project validates quality across unit, integration, property, and mutation testing. All contributors must follow these practices for every change that lands on `main`.

## Goals and Quality Gates

The canonical record of currently enforced gates lives in
[`docs/reference/QUALITY_GATES.md`](../../reference/QUALITY_GATES.md).
This playbook explains strategy and targets around those gates.

Current reality:

- **Enforced today:** bootstrap/doc checks, lint, type compatibility, buildability,
  smoke boot, baseline tests, and the Vitest coverage run itself.
- **Target, not yet hard gate:** repository-wide coverage thresholds above the
  current baseline.
- **Target, not yet hard gate:** fully silent stderr across every test suite.
- **Deterministic reproducibility:** runs should remain reproducible via
  `TEST_SHUFFLE_SEED` and Fast-Check seeds captured in logs.

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
- Contract tests ensure OpenAPI parity by loading [`docs/reference/openapi.yaml`](../reference/openapi.yaml) directly.

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

## Order Sensitivity Testing

When you need to investigate order dependence in the backend harness, repeat the
custom runner directly:

```bash
npm run test:node -- --repeat=5
```

This reuses the shuffled `node:test` runner under `tools/run-tests.mjs` and is the
currently supported way to probe order-sensitive failures.

## Performance Regression Harness

`npm run test:perf` drives the synthetic ledger generator under `tools/perf/` to create at least 12 288 trades (plus the seed deposit) and times `computeDailyStates` in the finance module. The harness:

- warms the holdings builder once to stabilize the Node.js JIT,
- enforces a **1 000 ms** maximum runtime for the holdings projection,
- validates NAV integrity and state length, and
- emits newline-delimited JSON metrics (`durationMs`, `heapDeltaMb`, `navSample`) suitable for CI log scraping.

Regressions should be triaged by comparing the structured logs over time. When environment constraints prevent sub-second results (e.g., under heavy CI contention), note the delta in the PR and follow up with optimization tasks.

## Console Warning Policy

Tests still aim to fail fast on project-owned console warnings/errors via setup
hooks (`server/__tests__/setup/global.js` and `src/setupTests.ts`), but the repo
still carries a small number of known stderr emissions from third-party rendering
and intentional network-fallback scenarios. Treat new warnings as regressions and
shrink the existing exceptions over time instead of normalizing more noise.

## Commands Reference

Use the following commands during local development and CI:

| Command                           | Purpose                                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `npm test`                        | Runs the default repository baseline: the shuffled `node:test` harness plus `vitest run`.                           |
| `npm run test:node -- --repeat=5` | Repeats the backend/shared harness five times to investigate order-sensitive failures.                              |
| `npm run test:perf`               | Generates a 12k+ transaction ledger and ensures holdings projection completes under 1 000 ms while logging metrics. |
| `npm run test:mutation`           | Invokes StrykerJS against targeted math modules and reports the mutation score.                                     |

For strict deprecation/warning checks, run:

```bash
NODE_OPTIONS="--trace-warnings --trace-deprecation --throw-deprecation" npm test -- --coverage
```

Document seeds and command outputs in PR descriptions to aid reproducibility.

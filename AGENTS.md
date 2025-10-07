<!-- markdownlint-disable -->
# AGENTS — Playbook for Automated Contributions (React/Vite/Express/Tailwind)

> **Repository:** `cortega26/portfolio-manager-server`  
> **Stack:** React + Vite (frontend), Express (backend), TailwindCSS, Node.js (npm)  
> **Related docs:** `AI_IMPLEMENTATION_PROMPT.md`, `PHASE2_IMPLEMENTATION_PROMPT.md`, `docs/` (scoreboards & guides)

This playbook standardizes how an agent (e.g., Codex/Copilot/LLM) should **propose and apply safe changes** in this repo.

---

## 0) Golden Rules (read before touching code)
- **Make real edits, not reports.** Always create a branch and a PR with evidence (CI logs, coverage, diffs).
- **Do not silence warnings.** If Node/React/Vite emits warnings, **fix the root cause** (migrate APIs or narrowly scope third‑party issues).
- **Protect local data and secrets.** Never commit `data/` or `.env`; use `.env.example` as the contract.
- **Preserve compatibility.** Prefer minimal, safe diffs; split risky or breaking changes into follow‑up PRs.
- **Conventional Commits.** `feat|fix|chore|docs|refactor|test(scope): message`.

---

## 1) Environment Setup
1) Requirements (see README): Node 20.x and npm 9.x or newer.  
2) Install dependencies:
```bash
npm ci
```
3) Prepare environment variables:
```bash
cp .env.example .env
```
4) Verify ports & paths (see README): `PORT`, `DATA_DIR`, CORS config, `VITE_API_BASE`, caching/TTL.

**Run locally** (separate terminals are fine):
```bash
npm run server   # backend (Express)
npm run dev      # frontend (Vite)
```
Persistence sanity‑check: after adding a portfolio you should observe files like `data/portfolio_<id>.json` (not committed).

---

## 2) Quality Policy (tests, coverage, strictness)
- **Reference:** Follow the detailed [testing strategy guide](docs/testing-strategy.md) for expectations across unit, integration, property, and mutation layers.
- **Test runner:** Vitest (preferred). If Jest is present, keep parity; do not introduce heavy toolchains.
- **Coverage:** enable `--coverage` and enforce thresholds (global ≥ **80%**, **changed files ≥ 90%**). Never lower thresholds.
- **Order randomization:** run with shuffle to reveal order dependencies.
- **Fail on warnings:** throw on `console.warn`/`console.error` during tests via `setupTests.ts/js`. Do not blanket‑mute.
- **Node strict warnings:** on at least one pass locally and in CI:
```bash
NODE_OPTIONS="--trace-warnings --trace-deprecation --throw-deprecation" npm test -- --coverage
```

### Mutation & Property Testing (when runtime allows)
- **Mutation:** integrate StrykerJS for hot domain modules (ROI, cash accrual, SPY benchmark parity). Schedule nightly if runtime is heavy.
- **Property‑based:** use `fast-check` to assert invariants (e.g., deposit scaling, zero‑return day leaves cumulative ROI unchanged, portfolio==SPY when trades mirror 1:1).

**Example `setupTests.ts` snippet (Vitest):**
```ts
import { vi } from 'vitest';

const throwOn = (method: 'warn' | 'error') => {
  const orig = console[method];
  vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
    orig(...args);
    const msg = String(args?.[0] ?? '');
    throw new Error(`Console ${method}: ${msg}`);
  });
};

throwOn('warn');
throwOn('error');
```
Make sure this file is referenced in `vitest.config.ts` under `test.setupFiles`.

---

## 3) Security & Compliance
- **API keys per portfolio:** enforce strong keys; never store raw secrets; provide clear user feedback on weak keys.
- **Secret scanning:** ensure CI includes gitleaks (or equivalent). Do not commit `.env` or `data/`.
- **CORS:** restrict allowed origins via `CORS_ALLOWED_ORIGINS`.
- **Rate limiting & logging:** structured logs with levels (`LOG_LEVEL`); add rate limiting for sensitive endpoints if missing.

---

## 4) Agent Workflow (PEV: Plan → Execute → Verify)

### 4.1 Discover & Normalize
- Read `AI_IMPLEMENTATION_PROMPT.md` and `PHASE2_IMPLEMENTATION_PROMPT.md`.
- If `docs/HARDENING_SCOREBOARD.md` exists, **sync statuses** (create it otherwise).
- Build a task list with **ID, title, status, acceptance criteria**.

### 4.2 Execute
1) **Branch:** `feat|fix/<id>-<slug>`  
2) Implement minimal, safe changes that satisfy acceptance criteria.
3) **Tests:** add/adjust tests (Vitest + fast‑check). Avoid flakes (shuffle; clean fixtures).
4) **Deprecations:** migrate React/Vite/Express/Node APIs instead of suppressing warnings.

### 4.3 Verify (local & CI)
- Lint & format: `npm run lint` / `npm run format` (if present).
- Tests with coverage; one strict pass with `NODE_OPTIONS` as above.
- Vite build: `npm run build`.
- Attach in the PR: CI link, coverage before→after, mutation score (if applicable), and a short list of fixed warnings.

### 4.4 Roadmap snapshot (refreshed 2025-10-07)
- **Phase 1 — Immediate**: Completed. README, API key enforcement, security audit logging, and `.env.example` all landed on
  `main`; treat these as baselines when reviewing regressions.
- **Phase 2 — Documentation**: `docs/openapi.yaml` now documents machine-readable errors (including `WEAK_KEY`), and this
  `AGENTS.md` plus `docs/HARDENING_SCOREBOARD.md` were refreshed together. When instructions evolve, update all three (OpenAPI,
  README, scoreboard) in the same PR to avoid drift.
- **Phase 3 — Observability**: Upcoming work includes request-id propagation and admin tooling (see scoreboard entries `OBS-2`
  and `OBS-3`). Start new work by confirming status in `docs/HARDENING_SCOREBOARD.md`.

---

## 5) Default Acceptance Criteria (for any agent PR)
- ✅ **CI green** (tests, build, lint and/or typecheck if configured).
- ✅ **Coverage not reduced**; global ≥ 80%, changed files ≥ 90%.
- ✅ **Zero project‑originated deprecations** during tests/build.
- ✅ **Documentation updated**: README, `docs/HARDENING_SCOREBOARD.md`, and a clear PR changelog.
- ✅ **Scoped change**; breaking changes or large refactors go in separate PRs.

---

## 6) Common Task Menu

### A. Stabilize tests & eliminate deprecations
- Reproduce failures and warnings; fix root causes.
- Implement `setupTests` to fail on `console.warn/error`.
- Ensure one strict CI run with `NODE_OPTIONS` deprecation throwing.

### B. “Test the tests” (harden the suite)
- Enable order randomization; pass 5 consecutive runs.
- StrykerJS or anti‑tests + metamorphic tests for ROI/cash/benchmark modules.
- Strengthen assertions; cover invariants.

### C. Sync scoreboard & implement the first pending item
- Parse `AI_IMPLEMENTATION_PROMPT.md`, update `docs/HARDENING_SCOREBOARD.md`.
- If everything is up to date, implement the **first unresolved** item (or the earliest Quick Win ≤ 2h).

### D. Backend endpoints/services (Express)
- Robust input validation, correct status codes, time & timezone handling.
- Timeouts & retry for external price fetch; caching with TTL from `.env`.
- Structured error handling; avoid leaking internals to clients.

### E. UI/UX (React + Vite + Tailwind)
- Form validations for transactions; basic accessibility.
- Clear error feedback from backend; sync `VITE_API_BASE`; performance‑friendly updates.

---

## 7) Repo Layout (quick guide)
- `src/` → frontend (React + Vite)
- `server/` → backend (Express routes/controllers)
- `shared/` → shared utilities (types & helpers)
- `data/` → on‑disk persistence (**do not commit**)
- `docs/` → guides & scoreboards
- `.github/workflows/` → CI (tests, build, security)
- `*.config.*` → ESLint, Tailwind, PostCSS, Vite, etc.

---

## 8) Templates

### 8.1 PR Description (paste into PR)
- **Summary:** what changed and why.
- **Evidence:** CI link(s) + coverage (before/after) + mutation score (if applicable).
- **Risks:** compatibility, data, security.
- **Follow‑ups:** linked issues/PRs.

### 8.2 Conventional Commits (examples)
- `fix(server): correct ROI calculation for out‑of‑order deposits`
- `test: add property‑based tests with fast‑check`
- `chore(ci): run tests with strict NODE_OPTIONS`
- `docs: sync HARDENING_SCOREBOARD`

---

## 9) Guardrails
- **Never** lower coverage thresholds to get green CI.
- **Never** disable warnings globally; if necessary, narrowly filter specific third‑party modules and explain why in code comments + PR.
- **Never** add heavy dependencies without justification; prefer lightweight devDeps.

---

## 10) Reference Commands
```bash
# install
npm ci

# local dev
npm run server &
npm run dev

# quality
npm run lint --if-present
npm run format --if-present

# tests
npm test -- --coverage
NODE_OPTIONS="--trace-warnings --trace-deprecation --throw-deprecation" npm test -- --coverage

# build
npm run build
```

---

## 11) Optional — CI Skeleton (GitHub Actions)
```yaml
name: ci

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [20.x]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: npm
      - run: npm ci
      - run: npm run lint --if-present
      - run: npm run typecheck --if-present
      - run: npm test -- --coverage
      - run: NODE_OPTIONS="--trace-warnings --trace-deprecation --throw-deprecation" npm test -- --coverage
      - run: npm run build
```

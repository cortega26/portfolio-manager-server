<!-- markdownlint-disable -->
# Task: Advance Phase 3 Improvements for Portfolio Manager

## Context Snapshot (October 2025)
- **Project**: Node.js/React portfolio manager with Express backend (`server/`) and Vite frontend (`src/`).
- **Baseline**: Phases 1 & 2 from `comprehensive_audit_v3.md` are complete on `main`.
  - README onboarding, API key policy, audit logging, `.env.example`, brute-force guard, caching, compression, bundle splits, and admin observability are already merged. See `docs/HARDENING_SCOREBOARD.md` for verification.
- **Remaining Gaps**: Audit section 5 (CODE-1) and section 4 (PERF-4, PERF-5) call out maintainability and UI scalability gaps that are still open in the current repo state.
- **Primary Sources**: `comprehensive_audit_v3.md`, `docs/HARDENING_SCOREBOARD.md`, `README.md`, and existing implementation in `server/` + `src/`.

## Active Objectives (Phase 3)

### 1. CODE-1 — Refactor High-Complexity Finance Functions (Priority: 🟢 Low, Effort: 4h)
**Goal**: Reduce cyclomatic complexity for `buildHoldings` and `computeDailyReturnRows` (see audit §5 "Code Quality" and §8 "Quarter 1").

**Scope**:
- `server/finance/portfolio.js` (`buildHoldings`, `computeDailyStates`, helpers).
- `server/finance/returns.js` (`computeDailyReturnRows`).

**Requirements**:
1. Break each complex function into focused helpers (e.g., sorting, ledger updates, position valuation, signal application).
2. Keep all math identical. Extend unit/property tests (`server/__tests__/holdings.test.js`, `server/__tests__/returns.test.js`, `server/__tests__/ledger.property.test.js`, `src/__tests__/holdings_ledger.test.js`) to guard refactors.
3. Target complexity ≤8 per function and ≤80 LOC per helper (justify in PR if exceeding for correctness).
4. Preserve immutability guarantees and existing shared utilities (`shared/constants.js`, decimal helpers).
5. Update docs/comments where algorithms change; ensure README performance claims remain true.

**Acceptance Criteria**:
- Static analysis shows reduced complexity (add ESLint rule or manual report in PR notes).
- All tests pass with unchanged snapshots/property distributions.
- `docs/HARDENING_SCOREBOARD.md` row `CODE-1` flipped to DONE with references to new helpers/tests.

### 2. PERF-4 — Virtual Scrolling for Large Transaction Tables (Priority: 🟢 Low, Effort: 4h)
**Goal**: Keep UI responsive for 10k+ transactions per audit §4 and §8.

**Scope**:
- `src/components/TransactionsTab.jsx` (currently paginated only).
- Consider `src/components/Holdings.jsx` if large holdings lists benefit.

**Requirements**:
1. Introduce virtualization (`react-window` preferred) with graceful fallback for small datasets.
2. Maintain accessibility: table semantics, keyboard navigation, and screen reader support.
3. Ensure delete actions, alternating row styles, and totals still render correctly.
4. Add/adjust tests (`src/__tests__/Transactions.integration.test.jsx`, new component tests) for virtualization behavior (initial render, scroll-to-row, deletion).
5. Document changes in README (usage/performance tips) and update bundle analysis if dependency impact occurs.

**Acceptance Criteria**:
- Large fixture (>=10k rows) renders within 60 FPS in Vitest DOM benchmark (use `@testing-library/react` + `performance.now`).
- No regression in pagination controls (keep for fallback or remove with rationale).
- README gains subsection on "Handling large portfolios" referencing virtualization.
- `docs/HARDENING_SCOREBOARD.md` new row `PERF-4` marked DONE with CI evidence.

### 3. PERF-5 — Debounced Search & Filters (Priority: 🟢 Low, Effort: 1h)
**Goal**: Reduce rerenders while filtering transactions per audit §4.

**Scope**: `src/components/TransactionsTab.jsx` (search/filter inputs) and supporting utils.

**Requirements**:
1. Add client-side search/filter with debounce (≈300 ms). Use lightweight utility (`useMemo` + `setTimeout` or `lodash.debounce`). Avoid global state pollution.
2. Ensure filter integrates with virtualization (only filtered rows virtualized).
3. Provide clear UX (placeholder text, empty states) and maintain accessible labels.
4. Extend tests to cover debounce timing (use fake timers in Vitest) and filter correctness.
5. Update README troubleshooting/performance tips accordingly.

**Acceptance Criteria**:
- Filtering 10k rows completes within 50 ms after debounce flush.
- Tests prove debounce and filtering logic works; coverage for new utilities ≥90%.
- Scoreboard entry `PERF-5` added/updated with DONE status.

### 4. API Versioning & Client Compatibility (Priority: 🟢 Low, Effort: 2h)
**Goal**: Prepare for backward-compatible releases (audit §8 tasks 14 & 15).

**Scope**:
- `server/app.js` (routing), `server/index.js` (app creation), `src/utils/api.js`, and any frontend calls.

**Requirements**:
1. Introduce `/api/v1` prefix while keeping legacy `/api` routes temporarily (feature-flag or dual routing) to avoid breaking clients.
2. Propagate `X-Request-ID` (already generated via `pinoHttp`) to clients via response headers and document usage.
3. Update tests (integration + contract) to hit versioned routes. Ensure OpenAPI spec (`docs/openapi.yaml`) reflects versioning.
4. Document migration in README + `docs/SECURITY.md` (traceability of requests with IDs).
5. Update scoreboard with new row `API-1` (or reuse existing if present) marking status.

**Acceptance Criteria**:
- All API endpoints respond under `/api/v1/*` with identical payloads.
- Legacy paths either proxy to versioned handlers or return informative deprecation warnings (non-breaking).
- Contract tests pass against updated OpenAPI schema.

### 5. Documentation Debt — Testing Strategy Guide (Priority: 🟡 Medium, Effort: 1h)
**Goal**: Close remaining doc gap flagged in audit §1 deliverables.

**Scope**: Create `docs/testing-strategy.md` and cross-link from README/AGENTS.

**Requirements**:
1. Document unit/integration/property test approach, coverage thresholds, mutation testing usage, and how to run strict suites.
2. Reference tooling commands (`npm test`, `npm run test:stress`, Stryker) and console warning policy.
3. Update README "Testing" section to link to the guide.
4. Reflect status in scoreboard (add `DOC-TEST-STRATEGY` row if missing).

**Acceptance Criteria**:
- New doc committed with actionable guidance (no placeholders).
- README and AGENTS updated with link to the strategy doc.

## Delivery Checklist (apply to every PR)
1. **Branch**: `feat/phase3-refactors` or similar (Conventional Commit on merge).
2. **Code**: Implement objectives above with minimal, well-tested diffs.
3. **Tests**: Run `npm run lint`, `npm test -- --coverage`, and `npm run build`. For virtualization performance, include measured timings in PR.
4. **Docs**: Update README, `docs/HARDENING_SCOREBOARD.md`, OpenAPI spec, and new testing guide as applicable.
5. **Evidence**: Attach CI links, coverage diff, and performance metrics in PR description.
6. **Compliance**: Follow security guardrails (no `shell=true`, no console noise, maintain structured logging).

## Kickoff Questions (confirm before coding)
- Which objective (CODE-1, PERF-4, PERF-5, API versioning, or docs) are you starting with?
- Have you reviewed related tests and docs so updates stay in sync?
- What performance or complexity metrics will you capture to prove success?

Once confirmed, begin with CODE-1 refactor unless a higher-priority incident overrides it.

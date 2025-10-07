<!-- markdownlint-disable -->
# AI Code Assistant Prompt Pack

Use these prompts to align any AI helper with the current repository state, audit findings, and guardrails. Each block can be pasted directly into an AI session before sharing follow-up instructions or diffs.

## 1. Phase 3 Context Sync
```
You are contributing to cortega26/portfolio-manager-server (React + Vite frontend, Express backend).
Baseline: Phase 1 & 2 items from comprehensive_audit_v3.md are complete (README onboarding, API key enforcement, audit logging, `.env.example`, brute force guard, caching, compression, bundle splits, admin monitoring).
Outstanding focus: Phase 3 deliverables from AI_IMPLEMENTATION_PROMPT.md (CODE-1 refactor, PERF-4 virtualization, PERF-5 debounced filters, API versioning, testing strategy doc).
Before coding, read AI_IMPLEMENTATION_PROMPT.md, docs/HARDENING_SCOREBOARD.md, and comprehensive_audit_v3.md sections 4 & 5. Confirm any assumptions explicitly.
Follow repository guardrails: no shell=true, maintain structured logging, keep coverage ≥90% for touched files, sync docs and scoreboard in the same PR.
```

## 2. CODE-1 Refactor Helper
```
Task: Deliver CODE-1 from AI_IMPLEMENTATION_PROMPT.md.
Refactor buildHoldings/computeDailyReturnRows to reduce complexity while preserving math.
Files: server/finance/portfolio.js, server/finance/returns.js, related tests in server/__tests__ and src/__tests__.
Steps:
1. Identify logical sub-steps and extract helpers (sorting, ledger projection, valuation, signal application).
2. Update/extend property tests to prove behavior unchanged.
3. Report complexity improvements and ensure docs/HARDENING_SCOREBOARD.md marks CODE-1 as DONE with references.
Run npm run lint, npm test -- --coverage, npm run build before finalizing.
```

## 3. Virtual Scrolling & Filters Prompt
```
Task: Implement PERF-4 and PERF-5 (virtual scrolling + debounced search) from AI_IMPLEMENTATION_PROMPT.md.
Focus files: src/components/TransactionsTab.jsx (and Holdings.jsx if needed), src/__tests__/Transactions.integration.test.jsx.
Requirements: integrate react-window (or similar) with accessible table semantics, keep delete actions working, add debounced filtering (≈300 ms) that cooperates with virtualization, and update README with a "Handling large portfolios" subsection.
Add tests covering virtualization rendering, scroll behavior, and debounce timing (use fake timers). Update docs/HARDENING_SCOREBOARD.md with new PERF-4/PERF-5 rows marked DONE.
```

## 4. API Versioning & Observability Prompt
```
Task: Add /api/v1 routing while maintaining legacy /api paths, surface X-Request-ID headers, and sync OpenAPI (AI_IMPLEMENTATION_PROMPT.md phase 3 objective 4).
Touch points: server/app.js, server/index.js, src/utils/api.js, docs/openapi.yaml, README.md, docs/SECURITY.md, contract tests in server/__tests__.
Ensure both route prefixes work during migration, tests cover the new prefix, and scoreboard records completion.
```

## 5. Testing Strategy Documentation Prompt
```
Task: Create docs/testing-strategy.md per AI_IMPLEMENTATION_PROMPT.md phase 3 objective 5.
Document unit/integration/property testing approach, coverage thresholds (global ≥80%, touched files ≥90%), strict console warning policy, mutation testing (Stryker), and commands (npm test, npm run test:stress, npm run test:mutation).
Update README and AGENTS.md to link to the new guide and sync docs/HARDENING_SCOREBOARD.md.
```

## 6. PR Completion Checklist Prompt
```
Before final response:
- Provide diffs and cite files.
- Summarize complexity or performance metrics collected.
- List commands executed (lint, tests, build) with results; mark "Deferred to CI" if tooling unavailable.
- Confirm docs/HARDENING_SCOREBOARD.md updated for completed objectives.
- Prepare PR body using make_pr tool with compliance summary: 📊 COMPLIANCE line, model used, tests, security scans, failures.
```

<!-- markdownlint-disable -->
| ID      | Title                            | Severity | Owner | Status       | Branch            | PR | Evidence (CI) |
|---------|----------------------------------|----------|-------|--------------|-------------------|----|---------------|
| G1      | Coverage gate                    | HIGH     |       | DONE         | feat/ci-hardening | [Compare](https://github.com/cortega26/portfolio-manager-server/compare/main...feat/ci-hardening) | GitHub Actions: CI (nyc check-coverage) |
| G2      | Lint gate                        | MEDIUM   |       | DONE         | feat/ci-hardening | [Compare](https://github.com/cortega26/portfolio-manager-server/compare/main...feat/ci-hardening) | GitHub Actions: CI (npm run lint) |
| G3      | Security audit gate              | MEDIUM   |       | DONE         | feat/ci-hardening | [Compare](https://github.com/cortega26/portfolio-manager-server/compare/main...feat/ci-hardening) | GitHub Actions: CI (gitleaks + npm audit) |
| G4      | Test artifacts                   | LOW      |       | DONE         | feat/ci-hardening | [Compare](https://github.com/cortega26/portfolio-manager-server/compare/main...feat/ci-hardening) | GitHub Actions: CI artifact (coverage/) |
| G5      | Release gate                     | HIGH     |       | DONE         | feat/ci-hardening | [Compare](https://github.com/cortega26/portfolio-manager-server/compare/main...feat/ci-hardening) | GitHub Actions: Deploy (needs ci) |
| DOC-1   | Enhanced user guide              | MEDIUM   |       | DONE         | main              |    | README.md (Getting Started, API Key Setup, Troubleshooting) |
| SEC-1   | Rate limiting                    | CRITICAL |       | DONE         | feat/security-hardening | [Compare](https://github.com/cortega26/portfolio-manager-server/compare/main...feat/security-hardening) | Local: npm test (api_validation rate-limit) |
| SEC-2   | JSON size limits                 | HIGH     |       | DONE         | feat/security-hardening | [Compare](https://github.com/cortega26/portfolio-manager-server/compare/main...feat/security-hardening) |               |
| SEC-3   | Per-portfolio API key            | HIGH*    |       | DONE         | main              |    | server/app.js (verifyPortfolioKey) |
| SEC-4   | Uniform error handler            | MEDIUM   |       | DONE         | feat/security-hardening | [Compare](https://github.com/cortega26/portfolio-manager-server/compare/main...feat/security-hardening) |               |
| SEC-5   | HTTPS/HSTS                       | HIGH     |       | DONE         | feat/security-hardening | [Compare](https://github.com/cortega26/portfolio-manager-server/compare/main...feat/security-hardening) |               |
| SEC-6   | Helmet + CSP                     | HIGH     |       | DONE         | feat/security-hardening | [Compare](https://github.com/cortega26/portfolio-manager-server/compare/main...feat/security-hardening) |               |
| SEC-7   | Strict CORS                      | HIGH     |       | DONE         | feat/security-hardening | [Compare](https://github.com/cortega26/portfolio-manager-server/compare/main...feat/security-hardening) |               |
| SEC-8   | CSV/Excel injection guard        | MEDIUM   |       | DONE         | main              |    | src/utils/csv.js |
| SEC-9   | Brute-force API key guard        | CRITICAL |       | DONE         | main              |    | server/app.js (key failure tracker); Local: npm test (2025-10-05) |
| SEC-10  | API key strength enforcement     | HIGH     |       | DONE         | main              |    | server/middleware/validation.js; shared/apiKey.js; server/__tests__/api_errors.test.js |
| SEC-11  | Security audit logging           | MEDIUM   |       | DONE         | main              |    | server/middleware/auditLog.js; server/__tests__/audit_log.test.js |
| STO-1   | Atomic writes                    | CRITICAL |       | DONE         | feat/sto-hardening | [Compare](https://github.com/cortega26/portfolio-manager-server/compare/main...feat/sto-hardening) | Local: lint/test |
| STO-2   | Per-portfolio mutex              | CRITICAL |       | DONE         | feat/sto-hardening | [Compare](https://github.com/cortega26/portfolio-manager-server/compare/main...feat/sto-hardening) | Local: lint/test |
| STO-3   | Idempotent tx IDs                | HIGH     |       | DONE         | feat/sto-hardening | [Compare](https://github.com/cortega26/portfolio-manager-server/compare/main...feat/sto-hardening) | Local: lint/test |
| STO-4   | Path hygiene                     | HIGH     |       | DONE         | feat/sto-hardening | [Compare](https://github.com/cortega26/portfolio-manager-server/compare/main...feat/sto-hardening) | Local: lint/test |
| MTH-1   | Decimal math policy              | CRITICAL |       | DONE         | feat&#124;fix/math-decimal-policy | Pending | Local: node --test |
| MTH-2   | TWR/MWR & benchmark policy       | HIGH     |       | DONE         | main              |    | Local: npm test (money_weighted) |
| MTH-3   | Cash accruals doc & proration    | MEDIUM   |       | DONE         | main              |    | docs/cash-benchmarks.md (Day-count, proration, effective-date sections) |
| COM-1   | Request validation (zod)         | CRITICAL |       | DONE         | main              |    | src/utils/api.js, src/utils/portfolioSchema.js; Local: npm test (2025-10-05) |
| COM-2   | Oversell reject + opt clip       | HIGH     |       | DONE         | main              |    | server/app.js (enforceOversellPolicy) |
| COM-3   | Same-day determinism rules       | MEDIUM   |       | DONE         | feat/same-day-determinism | Pending | server/__tests__/portfolio.test.js |
| COM-4   | Error codes & pagination         | MEDIUM   |       | DONE         | feat/com-validation | [Compare](https://github.com/cortega26/portfolio-manager-server/compare/main...feat/com-validation) | Local: lint/test |
| DX-1    | Transactions form reducer        | MEDIUM   |       | DONE         | main              |    | src/components/TransactionsTab.jsx; Local: npm test (2025-10-05) |
| DX-2    | Environment template             | LOW      |       | DONE         | main              |    | `.env.example` committed; README "Environment configuration" section |
| PERF-1  | Price caching + stale guard      | HIGH     |       | DONE         | feat\|fix/cache-etag-cache | Local: node --test cache_behaviors; Phase2 Item1 tests (`server/__tests__/api_cache.test.js`) |               |
| PERF-2  | Incremental holdings             | MEDIUM   |       | TODO         |                   |    |               |
| PERF-3  | UI virtualization/pagination     | LOW      |       | TODO         |                   |    |               |
| PERF-4  | DB migration trigger             | LOW→MED  |       | TODO         |                   |    |               |
| PERF-5  | Response compression             | MEDIUM   |       | DONE         | main              |    | `server/__tests__/compression.test.js` (Phase2 Item3) |
| TEST-1  | Unit tests                       | HIGH     |       | DONE         | main              |    | Local: npm test (node --test coverage + src/__tests__/portfolioSchema.test.js) |
| TEST-2  | Property-based tests             | HIGH     |       | DONE         | feat/ledger-property-tests | PR pending | Randomized ledger invariants (cash floors, share conservation, deterministic TWR)
| TEST-3  | Golden snapshot tests            | HIGH     |       | DONE         | feat/returns-snapshots | Pending | Local: npm test -- returns.snapshot |
| TEST-4  | Concurrency tests                | HIGH     |       | DONE         | feat\|fix/storage-concurrency-tests | Pending | Local: node --test server/__tests__/storage_concurrency.test.js (≈0.8s, covers Promise.all writers + rename crash) |
| TEST-5  | API contract tests               | HIGH     |       | DONE         | feat\|fix/api-contract-validation | Pending | Local: npm test |
| TEST-6  | Integration API lifecycle tests  | CRITICAL |       | DONE         | main              |    | server/__tests__/integration.test.js; Local: npm test (2025-10-05) |
| TEST-7  | Edge-case regression tests       | HIGH     |       | DONE         | main              |    | server/__tests__/edge_cases.test.js; Local: npm test (2025-10-05) |
| TEST-8  | Frontend integration tests       | MEDIUM   |       | DONE         | main              |    | src/__tests__/Transactions.integration.test.jsx; Local: npm test (2025-10-05) |

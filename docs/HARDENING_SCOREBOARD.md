| ID      | Title                            | Severity | Owner | Status       | Branch            | PR | Evidence (CI) |
|---------|----------------------------------|----------|-------|--------------|-------------------|----|---------------|
| G1      | Coverage gate                    | HIGH     |       | TODO         |                   |    |               |
| G2      | Lint gate                        | MEDIUM   |       | TODO         |                   |    |               |
| G3      | Security audit gate              | MEDIUM   |       | TODO         |                   |    |               |
| G4      | Test artifacts                   | LOW      |       | TODO         |                   |    |               |
| G5      | Release gate                     | HIGH     |       | TODO         |                   |    |               |
| SEC-1   | Rate limiting                    | CRITICAL |       | DONE         | feat/security-hardening | [Compare](https://github.com/cortega26/portfolio-manager-server/compare/main...feat/security-hardening) |               |
| SEC-2   | JSON size limits                 | HIGH     |       | DONE         | feat/security-hardening | [Compare](https://github.com/cortega26/portfolio-manager-server/compare/main...feat/security-hardening) |               |
| SEC-3   | Per-portfolio API key            | HIGH*    |       | TODO         |                   |    |               |
| SEC-4   | Uniform error handler            | MEDIUM   |       | DONE         | feat/security-hardening | [Compare](https://github.com/cortega26/portfolio-manager-server/compare/main...feat/security-hardening) |               |
| SEC-5   | HTTPS/HSTS                       | HIGH     |       | DONE         | feat/security-hardening | [Compare](https://github.com/cortega26/portfolio-manager-server/compare/main...feat/security-hardening) |               |
| SEC-6   | Helmet + CSP                     | HIGH     |       | DONE         | feat/security-hardening | [Compare](https://github.com/cortega26/portfolio-manager-server/compare/main...feat/security-hardening) |               |
| SEC-7   | Strict CORS                      | HIGH     |       | DONE         | feat/security-hardening | [Compare](https://github.com/cortega26/portfolio-manager-server/compare/main...feat/security-hardening) |               |
| SEC-8   | CSV/Excel injection guard        | MEDIUM   |       | TODO         |                   |    |               |
| STO-1   | Atomic writes                    | CRITICAL |       | DONE         | feat/sto-hardening | [Compare](https://github.com/cortega26/portfolio-manager-server/compare/main...feat/sto-hardening) | Local: lint/test |
| STO-2   | Per-portfolio mutex              | CRITICAL |       | DONE         | feat/sto-hardening | [Compare](https://github.com/cortega26/portfolio-manager-server/compare/main...feat/sto-hardening) | Local: lint/test |
| STO-3   | Idempotent tx IDs                | HIGH     |       | DONE         | feat/sto-hardening | [Compare](https://github.com/cortega26/portfolio-manager-server/compare/main...feat/sto-hardening) | Local: lint/test |
| STO-4   | Path hygiene                     | HIGH     |       | DONE         | feat/sto-hardening | [Compare](https://github.com/cortega26/portfolio-manager-server/compare/main...feat/sto-hardening) | Local: lint/test |
| MTH-1   | Decimal math policy              | CRITICAL |       | DONE         | feat&#124;fix/math-decimal-policy | Pending | Local: node --test |
| MTH-2   | TWR/MWR & benchmark policy       | HIGH     |       | TODO         |                   |    |               |
| MTH-3   | Cash accruals doc & proration    | MEDIUM   |       | TODO         |                   |    |               |
| COM-1   | Request validation (zod)         | CRITICAL |       | DONE         | feat/com-validation | [Compare](https://github.com/cortega26/portfolio-manager-server/compare/main...feat/com-validation) | Local: lint/test |
| COM-2   | Oversell reject + opt clip       | HIGH     |       | TODO         |                   |    |               |
| COM-3   | Same-day determinism rules       | MEDIUM   |       | TODO         |                   |    |               |
| COM-4   | Error codes & pagination         | MEDIUM   |       | DONE         | feat/com-validation | [Compare](https://github.com/cortega26/portfolio-manager-server/compare/main...feat/com-validation) | Local: lint/test |
| PERF-1  | Price caching + stale guard      | HIGH     |       | DONE         | feat\|fix/cache-etag-cache | Local: node --test cache_behaviors |               |
| PERF-2  | Incremental holdings             | MEDIUM   |       | TODO         |                   |    |               |
| PERF-3  | UI virtualization/pagination     | LOW      |       | TODO         |                   |    |               |
| PERF-4  | DB migration trigger             | LOW→MED  |       | TODO         |                   |    |               |
| TEST-1  | Unit tests                       | HIGH     |       | TODO         |                   |    |               |
| TEST-2  | Property-based tests             | HIGH     |       | TODO         |                   |    |               |
| TEST-3  | Golden snapshot tests            | HIGH     |       | TODO         |                   |    |               |
| TEST-4  | Concurrency tests                | HIGH     |       | TODO         |                   |    |               |
| TEST-5  | API contract tests               | HIGH     |       | TODO         |                   |    |               |

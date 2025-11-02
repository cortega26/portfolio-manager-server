# Top 10 Quality Risks — Portfolio Manager

| Rank | ID | Severity | Risk | Mitigation | Owner |
|------|----|----------|------|------------|-------|
| 1 | CQ-001 | S1 | ROI fallback fabricates gains/losses when API is down, misleading customers during outages. | Rebuild fallback ROI with cash-flow support and dividends; share logic with backend returns module. | Backend Lead |
| 2 | CQ-002 | S1 | Quadratic ROI fallback loop stalls the UI on large ledgers, compounding downtime. | Refactor to linear iteration with pre-sorted transactions and incremental state. | Frontend Lead |
| 3 | CQ-003 | S1 | Duplicate transaction UIDs are dropped silently, corrupting customer histories. | ✅ Validation now rejects duplicate IDs with a 409 response (2025-10-22). | API Owner |
| 4 | CQ-004 | S1 | localStorage snapshots overflow browser quotas, breaking offline recovery for enterprise portfolios. | Move to indexedDB/partial snapshots with size caps and telemetry. | Frontend Lead |
| 5 | CQ-005 | S2 | N+1 price downloads hammer the backend and upstream providers during ROI fallback. | ✅ Frontend now batches holdings through the bulk price endpoint, eliminating per-ticker fan-out and reusing cached series (2025-10-22). | Backend Lead |
| 6 | CQ-006 | S2 | JSON table rewrites scale poorly, risking timeouts and partial writes on large saves. | Implement append-only or chunked storage with compaction and streaming APIs. | API Owner |
| 7 | CQ-007 | S2 | Locale-insensitive share formatting causes user confusion and rounding errors. | ✅ Share displays use `formatNumber` with locale-aware precision and updated tests (2025-10-22). | Frontend Lead |
| 8 | CQ-008 | S2 | Toast dismissal control lacks localisation, reducing accessibility compliance. | Localise aria-labels and add RTL/a11y regression tests. | Frontend Lead |
| 9 | CQ-009 | S2 | Tests miss ROI income/cash-flow paths, allowing critical regressions to ship. | Extend unit/property tests to cover dividends, withdrawals, and staged deposits. | QA/Test Lead |
| 10 | CQ-010 | S2 | Minified `server/app.js` obstructs reviews and static tooling, slowing incident response. | Restore formatting/split modules and enforce prettier/eslint guardrails. | Backend Lead |

# Per-Portfolio Cash Interest Tasks

## Task Table

| ID | Title | Summary | Impact | Dependencies | Est. Effort | Files / Areas | Acceptance Criteria |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CASH-FND-1 | Inventory current cash-interest behaviour | Document nightly cash accrual job flow, existing rate sources (`cash_rates.json`), and feature flag interactions (`FEATURES_CASH_BENCHMARKS`, `FEATURES_MONTHLY_CASH_POSTING`). Capture how NAV/ROI/reporting consume cash interest today. | Establishes baseline knowledge and prevents regressions when introducing portfolio policies. | None | 2d | Docs in `docs/roadmap/`, server job definitions, related README sections. | Inventory doc published covering data sources, job timing, flag effects, and consumer modules; stakeholders sign off on completeness. |
| CASH-FND-2 | Draft per-portfolio cash policy model | Propose schema for storing per-portfolio cash policy (enable flag, APY override/schedule, posting cadence) and decide storage location (portfolio JSON vs. new collection). Include validation rules and migration approach outline. | Provides blueprint for schema/API changes; unblocks backend implementation. | CASH-FND-1 | 3d | Architecture notes, potential updates to `shared/` types, migration plan docs. | Reviewed design specifying schema fields, default behaviours, validation constraints, and storage location with approval notes. |
| CASH-FND-3 | Define API contract & acceptance test plan | Extend portfolio API contract for cash policy management, outline new endpoints/payloads, and draft comprehensive test plan (unit/integration/e2e, mutation/property scenarios). | Aligns cross-team expectations and prepares testing requirements. | CASH-FND-1, CASH-FND-2 | 2d | API docs (`docs/guides/`, README), test strategy documents. | API spec reviewed with stakeholders; test plan enumerates scenarios (interest off/on, overrides, monthly posting interactions, ROI verification) and tooling coverage. |
| CASH-BE-1 | Implement schema & persistence updates | Introduce cash policy storage in backend, including migrations/backfill to seed defaults for existing portfolios. Define default behaviour (inherit legacy rate). | Enables storing per-portfolio policy without data loss. | CASH-FND-2, CASH-FND-3 | 5d | `server/` persistence layer, migration scripts, `data/` schema docs. | Migration executes on sample data without errors; new schema persists policy fields and defaults align with legacy behaviour; rollback plan documented. |
| CASH-BE-2 | Expose policy management APIs | Add backend endpoints/handlers to CRUD per-portfolio policies, update validation/auth/audit logging, and sync shared typings. | Allows clients to manage cash policy via API. | CASH-BE-1 | 4d | `server/routes`, `server/controllers`, `shared/` types, API docs. | API endpoints pass unit/integration tests covering CRUD cases, validations enforce schema, and docs list payload/response examples. |
| CASH-BE-3 | Update nightly job & ROI logic | Refactor nightly accrual job to respect per-portfolio policies before falling back to globals, ensuring monthly posting, NAV snapshots, and ROI computations stay correct. | Ensures financial calculations align with new policies. | CASH-BE-1 | 4d | `server/jobs`, ROI calculators, related shared utilities. | Automated tests demonstrate accrual/ROI correctness across policy permutations; benchmarks remain within tolerances. |
| CASH-BE-4 | Backend testing & documentation refresh | Expand server/unit tests, CLI/backfill coverage, property/mutation suites as needed, and update backend docs (`docs/guides/cash-benchmarks.md`, README). | Locks in quality and communicates new behaviour. | CASH-BE-1, CASH-BE-2, CASH-BE-3 | 3d | Test suites in `server/__tests__/`, docs. | Coverage reports meet thresholds (≥90% for touched modules), docs updated with migration/test guidance, and mutation/property tests pass. |
| CASH-FE-1 | Design per-portfolio cash policy UI/UX | Decide placement (e.g., portfolio settings), copy, form validation, and feature flag gating strategy for cash policy controls. | Preps frontend for consistent UX and gating. | CASH-FND-3, CASH-BE-2 | 3d | Design docs, component blueprints in `src/`. | UX spec approved with mockups, validation rules, and accessibility notes; gating plan documented. |
| CASH-FE-2 | Implement frontend management experience | Build React components/API hooks for cash policy CRUD, with optimistic updates and fallbacks. | Provides user interface for managing cash policies. | CASH-FE-1, CASH-BE-2 | 5d | `src/` components/hooks, shared typings, translations. | Vitest + Playwright tests cover forms, validations, optimistic flows; UI matches spec and degrades gracefully when feature disabled. |
| CASH-FE-3 | Frontend documentation & guides | Update user-facing docs/FAQ explaining per-portfolio cash interest configuration and interactions with benchmarks/monthly posting. | Ensures users understand new controls. | CASH-FE-2 | 2d | README, `docs/guides/`, support FAQs. | Docs published with screenshots or callouts (if applicable), reflecting feature flag usage and troubleshooting steps. |
| CASH-ROL-1 | Data migration execution | Run production migration/backfill for existing portfolios, aligning defaults with previous global behaviour. Document operational runbook. | Safely transitions live data to new schema. | CASH-BE-1, CASH-BE-4 | 2d | Migration scripts, ops runbooks. | Migration validated on staging then production; runbook includes verification steps and rollback; sign-off recorded. |
| CASH-ROL-2 | Observability enhancements | Add metrics/logging/alerts to monitor policy usage and detect misconfiguration; update dashboards. | Provides visibility into rollout health. | CASH-BE-3, CASH-BE-4 | 3d | Logging/metrics modules, dashboards, docs. | Observability dashboards updated, alerts configured, logs audited to confirm structured events. |
| CASH-ROL-3 | Validation QA & change management | Execute end-to-end validation matrix, publish changelog, refresh scoreboards, and prepare regression checklist. | Confirms release readiness and informs stakeholders. | CASH-ROL-1, CASH-ROL-2, CASH-FE-3 | 3d | QA scripts, docs/reference, changelog. | QA report documents scenarios and results; changelog + scoreboard updated; regression checklist approved. |

## Dependency Graph
```
CASH-FND-1
  └─> CASH-FND-2
        └─> CASH-FND-3
              ├─> CASH-BE-1
              │     ├─> CASH-BE-2
              │     │     └─> CASH-FE-1
              │     │           └─> CASH-FE-2
              │     │                 └─> CASH-FE-3
              │     ├─> CASH-BE-3
              │     └─> CASH-BE-4
              │           └─> CASH-ROL-1
              │
              ├─> CASH-BE-1
              │     └─> CASH-ROL-1
              │           └─> CASH-ROL-3
              │
              └─> (via CASH-BE-3 & CASH-BE-4)
                    └─> CASH-ROL-2
                          └─> CASH-ROL-3
```

## Recommended Execution Order
1. CASH-FND-1
2. CASH-FND-2
3. CASH-FND-3
4. CASH-BE-1
5. CASH-BE-2
6. CASH-BE-3 (in parallel with design work once backend schemas stable)
7. CASH-BE-4
8. CASH-FE-1
9. CASH-FE-2
10. CASH-FE-3
11. CASH-ROL-2 (can start while CASH-FE-2 stabilises but completes after backend hardening)
12. CASH-ROL-1
13. CASH-ROL-3

## Task to Environment Flag & Migration Mapping
- **CASH-FND-1**: Document existing usage of `FEATURES_CASH_BENCHMARKS`, `FEATURES_MONTHLY_CASH_POSTING`, and `JOB_NIGHTLY_HOUR`; no migrations.
- **CASH-FND-2**: Define whether new feature flag (if any) needed; outline migration scaffolding but none executed.
- **CASH-FND-3**: Ensure API contract documents required flags; no migrations.
- **CASH-BE-1**: Implement migrations/backfill for new policy storage; may require temporary flag to gate writes until rollout.
- **CASH-BE-2**: Potentially gated behind `FEATURES_CASH_BENCHMARKS`; ensure handlers respect flag states; no new migrations beyond CASH-BE-1.
- **CASH-BE-3**: Update nightly job scheduled via `JOB_NIGHTLY_HOUR`; ensure job respects feature flags for cash benchmarks/monthly posting; no new migrations.
- **CASH-BE-4**: Update docs to reflect flag usage; migrations already covered.
- **CASH-FE-1**: Determine UI gating using `FEATURES_CASH_BENCHMARKS` or new flag; no migrations.
- **CASH-FE-2**: Implement feature-flag-aware UI; no migrations.
- **CASH-FE-3**: Document flag interactions; no migrations.
- **CASH-ROL-1**: Executes migrations/backfill in production; ensure flags allow staged rollout.
- **CASH-ROL-2**: Configure observability toggles; consider feature flag metrics; no migrations.
- **CASH-ROL-3**: Confirm final flag states and document migration completion; no additional migrations.

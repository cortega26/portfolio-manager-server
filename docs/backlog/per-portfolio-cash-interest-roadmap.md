<!-- markdownlint-disable MD013 -->

# Per-Portfolio Cash Interest Roadmap

This document breaks down the work required to let each portfolio specify whether its cash balance earns interest and, if so, at which rate. Follow the phases sequentially and split tasks into manageable tickets.

---

## Phase 1 – Foundations & Design

- **Inventory Current Behaviour**
  - Document the nightly cash accrual job, `cash_rates.json`, `FEATURES_CASH_BENCHMARKS`, and `FEATURES_MONTHLY_CASH_POSTING`.
  - Trace how NAV/ROI/reporting consume cash interest today.
- **Data Model Proposal**
  - Draft a per-portfolio “cash policy” object: enable/disable flag, optional APY override or schedule, posting cadence.
  - Decide where the policy lives (portfolio JSON, separate table, etc.).
- **API Contract Draft**
  - Sketch request/response changes (portfolio payload extension, new endpoints for managing the policy, validation requirements).
  - Collect stakeholder review/approval.
- **Acceptance Criteria & Test Plan**
  - Define scenarios (interest off, custom rate, monthly posting interactions, ROI verification).
  - Outline required unit/integration/e2e coverage and mutation/property tests.

---

## Phase 2 – Backend Implementation

- **Schema & Persistence Updates**
  - Introduce the cash policy into portfolio storage; write migrations/backfill scripts for existing data.
  - Decide default behaviour (e.g., inherit legacy global rate).
- **API Surface**
  - Implement handlers/endpoints to read/update the per-portfolio policy.
  - Update shared validation, auth, audit logging, and client typings.
- **Nightly Job & ROI Logic**
  - Refactor the accrual job to use the portfolio policy before falling back to global data.
  - Ensure monthly posting, NAV snapshots, and ROI calculations respect overrides.
- **Testing**
  - Add server/unit tests covering policy CRUD, nightly job variations, CLI/backfill logic.
  - Update mutation/property testing suites as needed.
- **Documentation**
  - Refresh backend docs (`docs/guides/cash-benchmarks.md`, README) to describe the new policy and migration path.

---

## Phase 3 – Frontend Integration

- **UI/UX Design**
  - Determine where cash settings live (e.g., portfolio settings tab) and finalise UX copy and validation rules.
- **Client Implementation**
  - Build React components/API hooks to manage the policy via the new backend endpoints.
  - Ensure optimistic updates and fallback behaviour work correctly.
- **Testing**
  - Extend Vitest suites for new forms and behaviours; update Playwright flows if applicable.
- **Docs & Guides**
  - Update user-facing documentation/FAQ describing how to configure cash interest per portfolio.

---

## Phase 4 – Rollout & Hardening

- **Data Migration**
  - Execute scripts or admin actions to seed policies for existing portfolios (mirroring prior global APY unless specified).
  - Communicate operational steps and any downtime expectations.
- **Observability**
  - Add logging/metrics to track per-portfolio policy usage and detect misconfiguration.
  - Update dashboards or alerts if needed.
- **Validation QA**
  - Run end-to-end scenarios across combinations (interest disabled, custom rate, monthly posting on/off) and confirm ROI parity with baselines.
- **Change Management**
  - Publish changelog entries, refresh scoreboards, and supply a regression checklist for future releases.

---

## Risks & Considerations

- `server/app.js` is currently minified into a single line; plan time to reformat or regenerate sources before modifying.
- Maintain backward compatibility with existing clients and environment-driven behaviour.
- Deploy backend and frontend changes in sync or gate via feature flags to avoid inconsistent states.
- Expect multi-ticket execution: treat backend refactor, schema changes, API work, and UI integration as separate deliverables.

---

Use this roadmap as the authoritative reference when breaking work into tickets or PRs. Update the document as requirements evolve.

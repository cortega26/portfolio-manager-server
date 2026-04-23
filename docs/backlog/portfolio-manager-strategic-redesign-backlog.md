# Portfolio Manager Unified - Strategic Redesign Backlog

> Status: Proposed
> Canonical implementation plan: `docs/implementation/portfolio-manager-strategic-redesign-plan.md`
> Last updated: 2026-04-22

This backlog is the traceability layer for the strategic redesign.
Every ticket must map to one epic, one milestone, one owner, and one explicit acceptance shape.

---

## 1. Status Legend

| Field    | Allowed values                                                        |
| -------- | --------------------------------------------------------------------- |
| Status   | `todo`, `in-progress`, `blocked`, `in-review`, `done`, `deferred`     |
| Priority | `P0`, `P1`, `P2`, `P3`                                                |
| Effort   | `S`, `M`, `L`, `XL`                                                   |
| Type     | `foundation`, `ux`, `feature`, `architecture`, `testing`, `migration` |

---

## 2. Epic Summary

| Epic    | Name                         | Status | Goal                                                          |
| ------- | ---------------------------- | ------ | ------------------------------------------------------------- |
| EPIC-1  | Trust Layer                  | `todo` | Make every key metric and alert auditable                     |
| EPIC-2  | Review Workflow              | `todo` | Replace tab-first entry with a daily review flow              |
| EPIC-3  | Ledger Operations Center     | `todo` | Make imports and reconciliation first-class                   |
| EPIC-4  | Policy Guidance Engine       | `todo` | Replace threshold-only signals with portfolio policy guidance |
| EPIC-5  | Modular Product Architecture | `todo` | Reduce delivery risk by decomposing major hot spots           |
| TRACK-A | Validation and Change Safety | `todo` | Protect correctness and rollout quality across all epics      |

---

## 3. Milestone Plan

| Milestone | Window           | Included epics          | Exit condition                                             |
| --------- | ---------------- | ----------------------- | ---------------------------------------------------------- |
| M1        | Foundation       | EPIC-1, EPIC-5, TRACK-A | Shared trust model and architecture carve-out path defined |
| M2        | Primary workflow | EPIC-2, EPIC-1, EPIC-5  | New review-first shell available behind flag               |
| M3        | Ledger integrity | EPIC-3, EPIC-1, TRACK-A | Import and exception workflows visible and actionable      |
| M4        | Guidance cutover | EPIC-4, EPIC-2, EPIC-5  | Policy-driven recommendations available with rationale     |
| M5        | Consolidation    | EPIC-5, TRACK-A         | Legacy duplicated flows retired and new model stabilized   |

---

## 4. Ticket Register

## EPIC-1 - Trust Layer

### SR-001 - Define shared trust metadata schema

| Field        | Value                              |
| ------------ | ---------------------------------- |
| Epic         | EPIC-1                             |
| Milestone    | M1                                 |
| Type         | foundation                         |
| Priority     | P0                                 |
| Effort       | M                                  |
| Status       | `todo`                             |
| Dependencies | none                               |
| Target areas | `shared/`, `server/types/`, `src/` |

Create canonical types for `source_type`, `freshness_state`, `confidence_state`, `degraded_reason`, and `explanation_summary`.

Acceptance:

- shared schema exists
- renderer and backend can reference the same finite state model
- no new trust UI ships outside the shared schema

### SR-002 - Add portfolio health summary contract

| Field        | Value                                            |
| ------------ | ------------------------------------------------ |
| Epic         | EPIC-1                                           |
| Milestone    | M1                                               |
| Type         | foundation                                       |
| Priority     | P0                                               |
| Effort       | M                                                |
| Status       | `todo`                                           |
| Dependencies | SR-001                                           |
| Target areas | `server/routes/portfolio.ts`, `server/services/` |

Expose backend summary contract for health, freshness, degraded states, unresolved exceptions, and action counts.

Acceptance:

- one backend contract summarizes portfolio trust state
- frontend no longer infers health from scattered endpoint results

### SR-003 - Extend price and analytics responses with trust metadata

| Field        | Value                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------ |
| Epic         | EPIC-1                                                                                           |
| Milestone    | M1                                                                                               |
| Type         | foundation                                                                                       |
| Priority     | P0                                                                                               |
| Effort       | L                                                                                                |
| Status       | `todo`                                                                                           |
| Dependencies | SR-001                                                                                           |
| Target areas | `server/routes/prices.js`, `server/routes/analytics.js`, `server/services/performanceHistory.js` |

Acceptance:

- prices, ROI, NAV, and benchmark payloads include explicit source and confidence metadata
- degraded and estimated states are machine-readable

### SR-004 - Build shared trust badge and evidence UI components

| Field        | Value                                       |
| ------------ | ------------------------------------------- |
| Epic         | EPIC-1                                      |
| Milestone    | M1                                          |
| Type         | ux                                          |
| Priority     | P0                                          |
| Effort       | M                                           |
| Status       | `todo`                                      |
| Dependencies | SR-001, SR-003                              |
| Target areas | `src/components/`, `src/components/shared/` |

Acceptance:

- reusable badge, tooltip, and evidence summary components exist
- dashboard, prices, holdings, and inbox can adopt the same presentation model

### SR-005 - Add trust metadata to dashboard primary metrics

| Field        | Value                                                          |
| ------------ | -------------------------------------------------------------- |
| Epic         | EPIC-1                                                         |
| Milestone    | M2                                                             |
| Type         | ux                                                             |
| Priority     | P0                                                             |
| Effort       | M                                                              |
| Status       | `todo`                                                         |
| Dependencies | SR-004                                                         |
| Target areas | `src/components/DashboardTab.jsx`, `src/components/dashboard/` |

Acceptance:

- NAV, ROI, return, and contribution surfaces visibly communicate freshness and confidence
- "estimated" is no longer the only trust signal

### SR-006 - Add rationale and evidence to inbox/recommendation cards

| Field        | Value                                                            |
| ------------ | ---------------------------------------------------------------- |
| Epic         | EPIC-1                                                           |
| Milestone    | M2                                                               |
| Type         | ux                                                               |
| Priority     | P0                                                               |
| Effort       | M                                                                |
| Status       | `todo`                                                           |
| Dependencies | SR-003, SR-004                                                   |
| Target areas | `src/components/InboxTab.jsx`, `server/finance/inboxComputer.ts` |

Acceptance:

- each actionable item shows why it exists
- explanation is backed by a backend payload, not UI-only copy

### SR-007 - Eliminate unresolved i18n key leakage on primary surfaces

| Field        | Value                                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Epic         | EPIC-1                                                                                                                    |
| Milestone    | M1                                                                                                                        |
| Type         | foundation                                                                                                                |
| Priority     | P0                                                                                                                        |
| Effort       | S                                                                                                                         |
| Status       | `todo`                                                                                                                    |
| Dependencies | none                                                                                                                      |
| Target areas | `src/components/dashboard/DashboardZone2.jsx`, `src/components/dashboard/DashboardChartsPanel.jsx`, translation resources |

Acceptance:

- no raw translation keys appear in dashboard or review surfaces

### SR-008 - Add preview versus persisted alert distinction

| Field        | Value                                                                                                     |
| ------------ | --------------------------------------------------------------------------------------------------------- |
| Epic         | EPIC-1                                                                                                    |
| Milestone    | M2                                                                                                        |
| Type         | foundation                                                                                                |
| Priority     | P1                                                                                                        |
| Effort       | M                                                                                                         |
| Status       | `todo`                                                                                                    |
| Dependencies | SR-003                                                                                                    |
| Target areas | `server/services/signalNotifications.js`, `src/components/InboxTab.jsx`, `src/components/HoldingsTab.jsx` |

Acceptance:

- users can tell whether a signal is preview-only, persisted, acknowledged, or resolved

---

## EPIC-2 - Review Workflow

### SR-020 - Define review-first navigation model

| Field        | Value                                                      |
| ------------ | ---------------------------------------------------------- |
| Epic         | EPIC-2                                                     |
| Milestone    | M1                                                         |
| Type         | ux                                                         |
| Priority     | P0                                                         |
| Effort       | M                                                          |
| Status       | `todo`                                                     |
| Dependencies | SR-002                                                     |
| Target areas | `src/PortfolioManagerApp.jsx`, `src/components/TabBar.jsx` |

Acceptance:

- new primary destinations are defined
- legacy destinations are mapped to drill-down or secondary navigation states

### SR-021 - Implement `Today` shell behind feature flag

| Field        | Value                                                       |
| ------------ | ----------------------------------------------------------- |
| Epic         | EPIC-2                                                      |
| Milestone    | M2                                                          |
| Type         | ux                                                          |
| Priority     | P0                                                          |
| Effort       | XL                                                          |
| Status       | `todo`                                                      |
| Dependencies | SR-020, SR-005, SR-006                                      |
| Target areas | `src/PortfolioManagerApp.jsx`, new `src/components/review/` |

Acceptance:

- review-first shell is accessible behind a feature flag
- user can see health, recent changes, and needed actions in one place

### SR-022 - Create `Needs attention` section

| Field        | Value                                                 |
| ------------ | ----------------------------------------------------- |
| Epic         | EPIC-2                                                |
| Milestone    | M2                                                    |
| Type         | ux                                                    |
| Priority     | P0                                                    |
| Effort       | M                                                     |
| Status       | `todo`                                                |
| Dependencies | SR-021                                                |
| Target areas | new `src/components/review/NeedsAttentionSection.jsx` |

Acceptance:

- section shows prioritized actionable items
- each item links to the exact detail flow needed

### SR-023 - Create `Recent changes` section

| Field        | Value                                                                           |
| ------------ | ------------------------------------------------------------------------------- |
| Epic         | EPIC-2                                                                          |
| Milestone    | M2                                                                              |
| Type         | ux                                                                              |
| Priority     | P1                                                                              |
| Effort       | M                                                                               |
| Status       | `todo`                                                                          |
| Dependencies | SR-021                                                                          |
| Target areas | new `src/components/review/RecentChangesSection.jsx`, backend support as needed |

Acceptance:

- user can review meaningful portfolio changes since last session or last review

### SR-024 - Create `Blocked by data` section

| Field        | Value                                               |
| ------------ | --------------------------------------------------- |
| Epic         | EPIC-2                                              |
| Milestone    | M2                                                  |
| Type         | ux                                                  |
| Priority     | P1                                                  |
| Effort       | M                                                   |
| Status       | `todo`                                              |
| Dependencies | SR-002, SR-003                                      |
| Target areas | new `src/components/review/DataBlockersSection.jsx` |

Acceptance:

- missing prices, unresolved exceptions, and degraded metrics are grouped into one visible section

### SR-025 - Demote low-frequency utilities from first-level navigation

| Field        | Value                                             |
| ------------ | ------------------------------------------------- |
| Epic         | EPIC-2                                            |
| Milestone    | M4                                                |
| Type         | ux                                                |
| Priority     | P1                                                |
| Effort       | M                                                 |
| Status       | `todo`                                            |
| Dependencies | SR-021                                            |
| Target areas | navigation components and route/shell composition |

Acceptance:

- reports, realized gains, and similar utilities remain accessible without competing as primary entry points unless intentionally retained

### SR-026 - Retire legacy dashboard as default entry

| Field        | Value                          |
| ------------ | ------------------------------ |
| Epic         | EPIC-2                         |
| Milestone    | M4                             |
| Type         | migration                      |
| Priority     | P1                             |
| Effort       | M                              |
| Status       | `todo`                         |
| Dependencies | SR-021, SR-022, SR-023, SR-024 |
| Target areas | `src/PortfolioManagerApp.jsx`  |

Acceptance:

- `Today` becomes the default entry surface
- legacy dashboard remains accessible only if deliberately preserved

---

## EPIC-3 - Ledger Operations Center

### SR-040 - Define import session and reconciliation state model

| Field        | Value                                             |
| ------------ | ------------------------------------------------- |
| Epic         | EPIC-3                                            |
| Milestone    | M2                                                |
| Type         | foundation                                        |
| Priority     | P0                                                |
| Effort       | L                                                 |
| Status       | `todo`                                            |
| Dependencies | SR-001                                            |
| Target areas | `server/import/`, `server/data/`, `server/types/` |

Acceptance:

- import sessions and reconciliation states have explicit backend representation

### SR-041 - Define ledger exception taxonomy

| Field        | Value                                |
| ------------ | ------------------------------------ |
| Epic         | EPIC-3                               |
| Milestone    | M2                                   |
| Type         | foundation                           |
| Priority     | P0                                   |
| Effort       | M                                    |
| Status       | `todo`                               |
| Dependencies | SR-040                               |
| Target areas | `server/import/`, `server/services/` |

Acceptance:

- duplicate, ambiguous, unsupported, and missing-data issues have explicit exception types

### SR-042 - Build backend APIs for unresolved ledger issues

| Field        | Value                                                   |
| ------------ | ------------------------------------------------------- |
| Epic         | EPIC-3                                                  |
| Milestone    | M3                                                      |
| Type         | foundation                                              |
| Priority     | P0                                                      |
| Effort       | L                                                       |
| Status       | `todo`                                                  |
| Dependencies | SR-041                                                  |
| Target areas | `server/routes/import.js`, `server/routes/portfolio.ts` |

Acceptance:

- unresolved issues can be listed, filtered, and acted on via API

### SR-043 - Build import preview and decision flow

| Field        | Value                                                         |
| ------------ | ------------------------------------------------------------- |
| Epic         | EPIC-3                                                        |
| Milestone    | M3                                                            |
| Type         | feature                                                       |
| Priority     | P0                                                            |
| Effort       | XL                                                            |
| Status       | `todo`                                                        |
| Dependencies | SR-040, SR-042                                                |
| Target areas | `server/import/csvPortfolioImport.js`, new import UI surfaces |

Acceptance:

- user can preview import impact before applying changes
- import issues are surfaced before they silently mutate the ledger

### SR-044 - Create ledger operations center UI

| Field        | Value                                                                     |
| ------------ | ------------------------------------------------------------------------- |
| Epic         | EPIC-3                                                                    |
| Milestone    | M3                                                                        |
| Type         | ux                                                                        |
| Priority     | P0                                                                        |
| Effort       | XL                                                                        |
| Status       | `todo`                                                                    |
| Dependencies | SR-042, SR-043                                                            |
| Target areas | new `src/components/ledger/`, `src/components/import/`, shell integration |

Acceptance:

- user can see import state, exception counts, and reconciliation health without scanning raw ledger rows

### SR-045 - Split manual transaction entry from ledger review

| Field        | Value                                |
| ------------ | ------------------------------------ |
| Epic         | EPIC-3                               |
| Milestone    | M3                                   |
| Type         | ux                                   |
| Priority     | P1                                   |
| Effort       | L                                    |
| Status       | `todo`                               |
| Dependencies | SR-044                               |
| Target areas | `src/components/TransactionsTab.jsx` |

Acceptance:

- manual entry remains available
- it no longer dominates the same screen as large-scale ledger review

### SR-046 - Add post-import delta summary

| Field        | Value                                                |
| ------------ | ---------------------------------------------------- |
| Epic         | EPIC-3                                               |
| Milestone    | M3                                                   |
| Type         | feature                                              |
| Priority     | P1                                                   |
| Effort       | M                                                    |
| Status       | `todo`                                               |
| Dependencies | SR-043                                               |
| Target areas | backend import summary payloads and import review UI |

Acceptance:

- user sees what changed in holdings, cash, alerts, and exceptions after an import

---

## EPIC-4 - Policy Guidance Engine

### SR-060 - Define portfolio policy schema

| Field        | Value                                                                     |
| ------------ | ------------------------------------------------------------------------- |
| Epic         | EPIC-4                                                                    |
| Milestone    | M3                                                                        |
| Type         | foundation                                                                |
| Priority     | P0                                                                        |
| Effort       | L                                                                         |
| Status       | `todo`                                                                    |
| Dependencies | SR-001                                                                    |
| Target areas | `shared/`, `server/types/`, `shared/settings.js` or adjacent policy model |

Acceptance:

- policy schema supports allocation bands, concentration limits, cash targets, and review cadence

### SR-061 - Build policy evaluation backend service

| Field        | Value                                                           |
| ------------ | --------------------------------------------------------------- |
| Epic         | EPIC-4                                                          |
| Milestone    | M4                                                              |
| Type         | feature                                                         |
| Priority     | P0                                                              |
| Effort       | XL                                                              |
| Status       | `todo`                                                          |
| Dependencies | SR-060, SR-003                                                  |
| Target areas | new backend service modules, existing signal and inbox services |

Acceptance:

- policy evaluation produces recommendation records with severity and rationale

### SR-062 - Redesign inbox as recommendation queue

| Field        | Value                                                               |
| ------------ | ------------------------------------------------------------------- |
| Epic         | EPIC-4                                                              |
| Milestone    | M4                                                                  |
| Type         | ux                                                                  |
| Priority     | P0                                                                  |
| Effort       | L                                                                   |
| Status       | `todo`                                                              |
| Dependencies | SR-061, SR-021                                                      |
| Target areas | `src/components/InboxTab.jsx`, review components, backend contracts |

Acceptance:

- inbox is no longer just an event list
- recommendations can be acknowledged, snoozed, dismissed, or resolved

### SR-063 - Build policy setup UI with opinionated defaults

| Field        | Value                                                                        |
| ------------ | ---------------------------------------------------------------------------- |
| Epic         | EPIC-4                                                                       |
| Milestone    | M4                                                                           |
| Type         | feature                                                                      |
| Priority     | P1                                                                           |
| Effort       | L                                                                            |
| Status       | `todo`                                                                       |
| Dependencies | SR-060                                                                       |
| Target areas | `src/components/SettingsTab.jsx`, possibly new policy configuration surfaces |

Acceptance:

- users can adopt policy guidance without building a complex rule system manually

### SR-064 - Replace threshold prominence in holdings view

| Field        | Value                                                                    |
| ------------ | ------------------------------------------------------------------------ |
| Epic         | EPIC-4                                                                   |
| Milestone    | M4                                                                       |
| Type         | ux                                                                       |
| Priority     | P1                                                                       |
| Effort       | M                                                                        |
| Status       | `todo`                                                                   |
| Dependencies | SR-061                                                                   |
| Target areas | `src/components/HoldingsTab.jsx`, `shared/signals.js` integration points |

Acceptance:

- holdings emphasize portfolio relevance, not just threshold crossing

### SR-065 - Add recommendation explanation panel

| Field        | Value                        |
| ------------ | ---------------------------- |
| Epic         | EPIC-4                       |
| Milestone    | M4                           |
| Type         | ux                           |
| Priority     | P1                           |
| Effort       | M                            |
| Status       | `todo`                       |
| Dependencies | SR-061, SR-062               |
| Target areas | recommendation UI components |

Acceptance:

- each recommendation can expand into rationale, evidence, and suggested next action

---

## EPIC-5 - Modular Product Architecture

### SR-080 - Carve review shell logic out of `PortfolioManagerApp.jsx`

| Field        | Value                         |
| ------------ | ----------------------------- |
| Epic         | EPIC-5                        |
| Milestone    | M1                            |
| Type         | architecture                  |
| Priority     | P0                            |
| Effort       | XL                            |
| Status       | `todo`                        |
| Dependencies | none                          |
| Target areas | `src/PortfolioManagerApp.jsx` |

Acceptance:

- shell orchestration moves into dedicated hooks or modules
- file responsibility is materially reduced

### SR-081 - Carve transaction form and list logic out of `TransactionsTab.jsx`

| Field        | Value                                |
| ------------ | ------------------------------------ |
| Epic         | EPIC-5                               |
| Milestone    | M2                                   |
| Type         | architecture                         |
| Priority     | P0                                   |
| Effort       | XL                                   |
| Status       | `todo`                               |
| Dependencies | none                                 |
| Target areas | `src/components/TransactionsTab.jsx` |

Acceptance:

- transaction entry, search/pagination, and ledger views become separate modules

### SR-082 - Split `server/routes/portfolio.ts` by concern

| Field        | Value                                           |
| ------------ | ----------------------------------------------- |
| Epic         | EPIC-5                                          |
| Milestone    | M2                                              |
| Type         | architecture                                    |
| Priority     | P0                                              |
| Effort       | XL                                              |
| Status       | `todo`                                          |
| Dependencies | none                                            |
| Target areas | `server/routes/portfolio.ts`, new route modules |

Acceptance:

- portfolio, inbox, signal notification, and ledger operations routes no longer share one mixed-concern module

### SR-083 - Introduce dedicated review domain query layer

| Field        | Value                                                     |
| ------------ | --------------------------------------------------------- |
| Epic         | EPIC-5                                                    |
| Milestone    | M2                                                        |
| Type         | architecture                                              |
| Priority     | P1                                                        |
| Effort       | L                                                         |
| Status       | `todo`                                                    |
| Dependencies | SR-002                                                    |
| Target areas | `server/services/`, `src/utils/api.js`, query composition |

Acceptance:

- primary review surface depends on a coherent query model rather than many ad hoc fetches

### SR-084 - Introduce dedicated recommendation domain services

| Field        | Value                                              |
| ------------ | -------------------------------------------------- |
| Epic         | EPIC-5                                             |
| Milestone    | M4                                                 |
| Type         | architecture                                       |
| Priority     | P1                                                 |
| Effort       | L                                                  |
| Status       | `todo`                                             |
| Dependencies | SR-061                                             |
| Target areas | backend services around signals, inbox, and policy |

Acceptance:

- recommendation logic is service-owned, not route-owned

### SR-085 - Retire obsolete legacy surfaces after parity

| Field        | Value                                |
| ------------ | ------------------------------------ |
| Epic         | EPIC-5                               |
| Milestone    | M5                                   |
| Type         | migration                            |
| Priority     | P1                                   |
| Effort       | L                                    |
| Status       | `todo`                               |
| Dependencies | SR-026, SR-045, SR-062               |
| Target areas | shell, legacy components, navigation |

Acceptance:

- duplicated or obsolete product surfaces are removed only after replacement parity is validated

---

## TRACK-A - Validation and Change Safety

### SR-100 - Create redesign feature flag policy

| Field        | Value                                            |
| ------------ | ------------------------------------------------ |
| Epic         | TRACK-A                                          |
| Milestone    | M1                                               |
| Type         | foundation                                       |
| Priority     | P0                                               |
| Effort       | S                                                |
| Status       | `todo`                                           |
| Dependencies | none                                             |
| Target areas | config, runtime config, feature-flag conventions |

Acceptance:

- every major redesign surface has a controlled rollout path

### SR-101 - Add integration tests for trust metadata contracts

| Field        | Value                  |
| ------------ | ---------------------- |
| Epic         | TRACK-A                |
| Milestone    | M1                     |
| Type         | testing                |
| Priority     | P0                     |
| Effort       | M                      |
| Status       | `todo`                 |
| Dependencies | SR-003                 |
| Target areas | backend contract tests |

Acceptance:

- trust metadata is asserted in API contract coverage

### SR-102 - Add renderer tests for review-first workflow states

| Field        | Value          |
| ------------ | -------------- |
| Epic         | TRACK-A        |
| Milestone    | M2             |
| Type         | testing        |
| Priority     | P0             |
| Effort       | M              |
| Status       | `todo`         |
| Dependencies | SR-021         |
| Target areas | renderer tests |

Acceptance:

- healthy, empty, degraded, and blocked workflow states are covered

### SR-103 - Add e2e smoke tests for import and exception flow

| Field        | Value                                 |
| ------------ | ------------------------------------- |
| Epic         | TRACK-A                               |
| Milestone    | M3                                    |
| Type         | testing                               |
| Priority     | P1                                    |
| Effort       | L                                     |
| Status       | `todo`                                |
| Dependencies | SR-043, SR-044                        |
| Target areas | Playwright or equivalent e2e coverage |

Acceptance:

- key import and exception flows are smoke-tested end to end

### SR-104 - Add shadow-mode comparison for legacy versus policy recommendations

| Field        | Value                                                         |
| ------------ | ------------------------------------------------------------- |
| Epic         | TRACK-A                                                       |
| Milestone    | M4                                                            |
| Type         | testing                                                       |
| Priority     | P1                                                            |
| Effort       | M                                                             |
| Status       | `todo`                                                        |
| Dependencies | SR-061                                                        |
| Target areas | backend recommendation evaluation and rollout instrumentation |

Acceptance:

- new policy guidance can be evaluated before full cutover

### SR-105 - Track hot-spot size reduction milestones

| Field        | Value                                   |
| ------------ | --------------------------------------- |
| Epic         | TRACK-A                                 |
| Milestone    | M5                                      |
| Type         | testing                                 |
| Priority     | P2                                      |
| Effort       | S                                       |
| Status       | `todo`                                  |
| Dependencies | SR-080, SR-081, SR-082                  |
| Target areas | engineering reporting and documentation |

Acceptance:

- known hot-spot files have explicit reduction targets and are measured at milestone close

---

## 5. Deferred / Explicit Non-Goals

These items are intentionally excluded from the redesign backlog unless strategy changes.

| ID     | Item                                | Reason                                                                    |
| ------ | ----------------------------------- | ------------------------------------------------------------------------- |
| NG-001 | AI chat copilot for investing       | Increases trust risk before core trust model is solved                    |
| NG-002 | Brokerage execution                 | Scales a weak core if done before workflow and trust redesign             |
| NG-003 | Mobile app                          | Premature before desktop workflow is strong and coherent                  |
| NG-004 | Social/community layer              | Low leverage relative to trust, workflow, and ledger integrity            |
| NG-005 | More charts as a primary initiative | Analytics density is already high; workflow quality is the bigger problem |

---

## 6. Backlog Maintenance Protocol

Whenever a ticket changes:

1. update its `Status`
2. update dependencies if scope changes
3. add new tickets instead of overloading existing ones when scope materially expands
4. keep epic and milestone mapping current
5. reflect strategic sequencing changes in the implementation plan, not only here

This backlog is only useful if it remains operationally honest.

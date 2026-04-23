# Portfolio Manager Unified - Strategic Redesign Implementation Plan

> Status: Proposed
> Origin: Strategic product, UX, and software architecture review on 2026-04-22.
> Canonical backlog: `docs/backlog/portfolio-manager-strategic-redesign-backlog.md`
> Intended audience: product, design, frontend, backend, and architecture owners.

---

## 1. Purpose

This document converts the strategic redesign verdict into an implementation plan that is:

- self-contained
- execution-oriented
- traceable to concrete code areas
- explicit about sequencing, risks, and validation

The plan is intentionally opinionated. It is not a wishlist. It assumes the product must evolve from a multi-tab portfolio viewer into a trusted, repeat-use portfolio operating system centered on review, decision support, and ledger integrity.

---

## 2. Why This Plan Exists

The current app is already capable in several important ways:

- solid local-first desktop architecture
- protected renderer/backend boundary
- strong financial precision guardrails
- functioning import, storage, ROI, and price infrastructure
- broad UI surface for portfolio, prices, transactions, reports, and alerts

But the product still has a structural ceiling:

1. It exposes too many surfaces before clarifying what matters now.
2. It computes more than it explains.
3. It detects signals without reliably converting them into action loops.
4. It treats ledger maintenance as a secondary workflow even though ledger quality determines product trust.
5. It concentrates too much product logic in a few oversized modules, making every serious redesign harder than it should be.

This plan addresses those five structural problems directly.

---

## 3. Strategic Thesis

The redesign will succeed only if the app becomes simultaneously:

- more useful: answers "what should I review or do now?"
- more trustworthy: every important number and alert is explainable
- more defensible: guidance reflects portfolio policy, not just price movement
- more repeatable: maintaining and reviewing the portfolio becomes easier, not heavier

The product should no longer feel like "10 tabs of portfolio information."
It should feel like "a trusted daily review system for a real investor."

---

## 4. Product Outcomes

The redesign targets the following outcomes.

| Dimension          | Current weakness                                            | Target outcome                                                                     |
| ------------------ | ----------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| User value         | High information density, weak prioritization               | User can open app and understand what needs attention in under 30 seconds          |
| Trust and accuracy | Freshness and methodology are not explicit enough           | Every material metric and alert includes source, freshness, and confidence context |
| Decision support   | Threshold signals are generic and isolated                  | Recommendations are grounded in portfolio policy, allocation, and review context   |
| Retention          | Product can be opened to inspect but not necessarily to act | App becomes a repeat-use check-in and maintenance workflow                         |
| Differentiation    | Feels like a strong tracker                                 | Feels like a portfolio operating system                                            |
| Maintainability    | Critical flows concentrated in giant files                  | Product surfaces and domain services become modular and testable                   |

---

## 5. Scope

### In scope

- redesign of primary information architecture
- trust and explainability layer for portfolio metrics, prices, and alerts
- policy-driven guidance replacing threshold-only signal emphasis
- ingestion and reconciliation workflow redesign
- architectural refactor required to support the new product model

### Explicitly out of scope for this plan

- brokerage execution and order routing
- social/community features
- mobile apps
- AI chat assistant for investment advice
- exotic asset classes beyond the current portfolio domain
- visual-only redesign disconnected from workflow or trust improvements

---

## 6. Operating Principles

1. Trust beats novelty.
2. Workflow beats tab proliferation.
3. Ledger integrity beats dashboard polish.
4. A recommendation without rationale is a defect.
5. Architecture work must unlock product work, not compete with it.
6. Every major user-facing change must have an explicit degradation mode.
7. Every phase must preserve the desktop-first and backend-owned domain boundaries.

---

## 7. Evidence Behind The Plan

The plan is grounded in observable repo state, not abstract preference.

- `src/PortfolioManagerApp.jsx` is currently a 1,788-line shell that owns too much orchestration.
- `src/components/TransactionsTab.jsx` is currently a 913-line workflow hotspot.
- `server/routes/portfolio.ts` is currently a 686-line mixed-concern route surface.
- The UI exposes unresolved translation keys in core surfaces such as `dashboard.zone2.empty` and `dashboard.charts.title`.
- The backend inbox can produce actionable items while the UI can still present an empty or weakly directive action surface.
- The action model still over-indexes on raw threshold transitions instead of policy-aware guidance.

These are not cosmetic issues. They are product-shaping constraints.

---

## 8. Delivery Model

The redesign will be executed through five epics plus one cross-cutting enablement track.

| Epic    | Name                         | Category                 | Goal                                                             |
| ------- | ---------------------------- | ------------------------ | ---------------------------------------------------------------- |
| EPIC-1  | Trust Layer                  | Must-have foundation     | Make every important number, alert, and recommendation auditable |
| EPIC-2  | Review Workflow              | UX / workflow redesign   | Replace tab-first navigation with a daily review operating flow  |
| EPIC-3  | Policy Guidance Engine       | High-leverage feature    | Turn thresholds into policy-aware guidance                       |
| EPIC-4  | Ledger Operations Center     | Must-have foundation     | Make import, exception handling, and reconciliation first-class  |
| EPIC-5  | Modular Product Architecture | Technical / architecture | Refactor the system to support sustained product evolution       |
| TRACK-A | Validation and Change Safety | Cross-cutting            | Protect correctness, baseline stability, and rollout quality     |

---

## 9. Recommended Sequencing

This plan should not be executed in numeric order only. Some work must start in parallel, but not all work should ship in parallel.

### Sequence summary

1. Establish trust and architecture guardrails.
2. Build the new review shell on top of trustworthy data states.
3. Redesign ledger operations so the product remains current with less manual effort.
4. Add policy-driven guidance once the review surface and trust model are stable.
5. Continue modularization until legacy orchestration hot spots are retired.

### Dependency summary

| Epic                                | Depends on                | Why                                                                          |
| ----------------------------------- | ------------------------- | ---------------------------------------------------------------------------- |
| EPIC-1 Trust Layer                  | none                      | It is the prerequisite for credible guidance and workflow                    |
| EPIC-2 Review Workflow              | EPIC-1 partial completion | The primary screen cannot claim actionability without data confidence states |
| EPIC-3 Policy Guidance Engine       | EPIC-1 and EPIC-2         | Guidance needs trust metadata and a review surface to land in                |
| EPIC-4 Ledger Operations Center     | EPIC-1 partial completion | Reconciliation needs explicit confidence and exception semantics             |
| EPIC-5 Modular Product Architecture | none, but runs in slices  | Must start early to reduce delivery risk for all other epics                 |
| TRACK-A Validation                  | all epics                 | Validation is continuous, not a final phase                                  |

---

## 10. Phase Plan

## Phase 0 - Mobilization and Guardrails

### Objective

Create the product and technical scaffolding needed to execute the redesign without ambiguity.

### Deliverables

- canonical strategic redesign plan
- canonical backlog with ticket IDs and dependencies
- success metrics dashboard for redesign rollout
- explicit rollout strategy and feature flag policy
- architecture decomposition map for impacted modules

### Main implementation tasks

- define redesign feature flag strategy for renderer and backend
- establish event taxonomy for review states, trust states, and reconciliation states
- define canonical naming for "review", "insight", "alert", "exception", "recommendation", and "task"
- identify hot paths in `src/PortfolioManagerApp.jsx`, `src/components/TransactionsTab.jsx`, and `server/routes/portfolio.ts`
- define acceptance metrics and rollout checkpoints

### Exit criteria

- workstreams and owners can execute without inventing vocabulary or scope mid-flight
- every ticket in the backlog maps to an epic, milestone, and acceptance shape

---

## Phase 1 - Trust Layer Foundation

### Objective

Introduce a first-class trust model for portfolio state so users can immediately understand:

- how fresh the data is
- where it came from
- whether it is estimated, confirmed, partial, or degraded
- why an alert or recommendation exists

### Why this phase comes first

Without this layer, the redesigned product would only be more polished, not more trustworthy.

### User-facing capabilities

- metric confidence states on dashboard, prices, positions, and reports
- alert rationale and evidence snapshots
- explicit price source and freshness details
- reconciliation state per portfolio and per import session
- clear distinction between preview, persisted event, and recommended action

### Implementation scope

#### Frontend

- add reusable trust badges and evidence affordances
- add explanation drawers or detail panels for metrics and recommendations
- add confidence labels to ROI, NAV, PnL, allocation, and inbox events
- remove unresolved i18n key leakage from primary surfaces

#### Backend

- extend response contracts to include freshness, source, confidence, and degradation metadata
- standardize error and fallback semantics for metric-producing endpoints
- expose explanation payloads for recommendations and alerts
- formalize difference between computed preview and persisted actionable event

#### Data model

- define `confidence_state`, `source_type`, `freshness_state`, `explanation`, and `degraded_reason`
- add portfolio-level health summary contract

### Target code areas

- `src/PortfolioManagerApp.jsx`
- `src/components/DashboardTab.jsx`
- `src/components/PricesTab.jsx`
- `src/components/HoldingsTab.jsx`
- `src/components/InboxTab.jsx`
- `src/lib/apiClient.js`
- `src/utils/api.js`
- `server/routes/portfolio.ts`
- `server/routes/prices.js`
- `server/routes/analytics.js`
- `server/services/performanceHistory.js`

### Risks

- overloading the UI with too many trust indicators
- exposing inconsistent semantics across endpoints

### Mitigations

- standardize on a small finite state model
- centralize rendering components for trust metadata
- block any new metric card or action surface that does not adopt the shared model

### Exit criteria

- every primary metric and primary alert has visible source and confidence context
- "estimated" is no longer the only trust signal
- preview and persisted alert states are distinct and visible

---

## Phase 2 - Review Workflow Redesign

### Objective

Replace the current tab-first mental model with a review-first operating model.

### Product shift

From:

- "pick a tab and inspect data"

To:

- "open the app and review what changed, what matters, and what requires action"

### Target top-level navigation

- `Today`
- `Positions`
- `Activity`
- `Settings`

Legacy deep views such as reports, prices, and realized gains should remain accessible, but not as equal first-level destinations unless usage data proves they deserve it.

### `Today` surface should answer

1. What changed since last review?
2. What needs attention now?
3. What is at risk?
4. What action is recommended?
5. What is blocked by missing or low-confidence data?

### Main implementation tasks

- introduce a new shell layout and route/state model for review-first entry
- create summary sections for `Needs attention`, `Review queue`, `Portfolio health`, and `Recent changes`
- embed trust metadata directly in the primary workflow
- reduce redundant dashboard modules that currently force horizontal scanning
- demote low-frequency utilities behind secondary navigation or drill-downs

### UX rules

- the first screen must be scannable in less than one viewport on laptop
- every action card must link to its relevant detail view
- empty states must explain why the user is clear, not merely that the list is empty
- a recommendation must always include reason, evidence, and next best step

### Target code areas

- `src/PortfolioManagerApp.jsx`
- `src/components/TabBar.jsx`
- `src/components/DashboardTab.jsx`
- `src/components/dashboard/*`
- `src/components/InboxTab.jsx`
- new review-focused components under `src/components/review/`

### Risks

- accidental loss of power-user discoverability
- redesign that changes layout but not user behavior

### Mitigations

- keep direct links into legacy detailed views during transition
- define review workflow success criteria before implementation
- run feature-flagged rollout until parity and usability are validated

### Exit criteria

- the product has a clear primary review workflow
- the user no longer needs to decide which of many first-level tabs to start with
- urgent events, portfolio health, and recent change are unified into one screen

---

## Phase 3 - Ledger Operations Center

### Objective

Turn transaction and import handling into a dedicated operations workflow that keeps the portfolio accurate with less friction.

### Product shift

From:

- a transaction form plus a large ledger table

To:

- an ingestion and reconciliation center with imports, exceptions, review queues, and auditability

### Main capabilities

- guided import entrypoints by source
- import preview and reconcile flow
- duplicate and idempotency review
- exception queue for unsupported or ambiguous rows
- missing price and corporate action review
- post-import portfolio delta summary
- reconciliation status and unresolved issue count

### Main implementation tasks

- split transaction entry from ledger operations and import review
- formalize exception types in backend
- add import session records and review state
- build queue-driven exception UI
- preserve manual add/edit flows without making them the main maintenance surface

### Backend scope

- import session model
- exception model
- deterministic issue IDs
- APIs for listing unresolved ledger issues
- APIs for applying review decisions and replaying reconciliation

### Target code areas

- `server/import/csvPortfolioImport.js`
- `server/data/portfolioState.js`
- `server/routes/import.js`
- `server/routes/portfolio.ts`
- `src/components/TransactionsTab.jsx`
- new components under `src/components/ledger/` and `src/components/import/`

### Risks

- high edge-case surface area
- temptation to build source-specific logic into the renderer

### Mitigations

- keep broker/source normalization server-side
- represent exceptions explicitly rather than burying them in toasts or logs
- scope first release to current supported sources and issue classes

### Exit criteria

- a user can tell if their portfolio is current and reconciled
- import exceptions are visible and actionable
- the ledger workflow no longer depends on scanning a giant generic transaction table

---

## Phase 4 - Policy Guidance Engine

### Objective

Replace threshold-only signal logic with policy-aware portfolio guidance.

### Product shift

From:

- "price crossed a percentage band"

To:

- "this holding or portfolio condition merits review because it violates or approaches a user-defined policy"

### Policy inputs

- target allocation ranges
- max position concentration
- desired cash reserve
- thesis or review note status
- review cadence
- rebalance tolerance bands
- optional holding-specific guardrails

### Recommendation examples

- `Trim TSLA: exceeds concentration band by 8.2 percentage points`
- `Review NVDA: entered trim zone and now contributes disproportionate portfolio risk`
- `No action: AMD crossed threshold but remains within allocation policy`
- `Portfolio maintenance needed: three holdings lack review notes older than 45 days`

### Main implementation tasks

- define portfolio policy schema
- create policy evaluation service in backend
- map policy violations to recommendation types and severities
- redesign inbox as review queue rather than loose event feed
- attach rationale, evidence, and recommended next step to every recommendation

### Backend scope

- policy schema and normalization
- evaluation engine
- persisted recommendation state
- acknowledgement, snooze, dismiss, and resolved transitions

### Frontend scope

- policy setup surfaces
- recommendation cards
- rationale panels
- review actions and acknowledgement flow

### Target code areas

- `shared/signals.js`
- `server/services/signalNotifications.js`
- `server/finance/inboxComputer.ts`
- `server/routes/signals.ts`
- `server/routes/portfolio.ts`
- `src/components/InboxTab.jsx`
- `src/components/HoldingsTab.jsx`
- `src/components/SettingsTab.jsx`

### Risks

- too much setup burden for simple users
- policy system becomes a complex rules engine without clear defaults

### Mitigations

- ship opinionated defaults
- allow progressive disclosure from simple to advanced policy
- avoid free-form rule builders in initial scope

### Exit criteria

- the action system is policy-aware
- recommendations explain why action is or is not needed
- threshold transitions alone no longer define the product's action model

---

## Phase 5 - Modular Product Architecture

### Objective

Refactor the codebase incrementally so the redesigned product can be maintained without increasing coupling or regression risk.

### Architectural goals

- separate shell orchestration from product surfaces
- separate domain queries from view composition
- separate review, ledger, policy, and settings concerns
- reduce route-level mixed concerns on the backend
- centralize UI trust and recommendation state models

### Required structural outcomes

- `PortfolioManagerApp` becomes a thin shell, not a mega-controller
- transactions, review, and settings flows move into dedicated modules
- portfolio routes are decomposed by concern
- backend services own evaluation and explanation logic, not route handlers
- shared types define confidence and recommendation contracts

### Refactor strategy

- no big-bang rewrite
- carve out vertical slices in support of shipping epics
- move code only when a target module and ownership boundary are clear

### Target hot spots

- `src/PortfolioManagerApp.jsx`
- `src/components/TransactionsTab.jsx`
- `server/routes/portfolio.ts`
- shared cross-tab state and API orchestration utilities

### Risks

- architecture work becomes invisible cleanup
- file moves create short-term churn

### Mitigations

- tie each refactor slice to an active product milestone
- define measurable size and ownership reduction goals
- preserve behavior with tests before moving logic

### Exit criteria

- critical product surfaces are modular and independently testable
- no single renderer or route module remains the default home for new logic

---

## 11. Cross-Cutting Validation Track

This track is mandatory across all phases.

### Required validation categories

- unit tests for domain and policy logic
- integration tests for backend contracts
- renderer tests for workflow state and trust surfaces
- e2e smoke tests for review, import, and recommendation flows
- regression checks for degradation and fallback states

### Mandatory validations per milestone

- `npm test`
- any area-specific tests added by the milestone
- targeted manual review of primary workflow states

### Quality gates

- no user-facing trust state ships without test coverage
- no recommendation logic ships without explicit rationale coverage
- no workflow redesign ships without empty, partial, degraded, and healthy-state coverage

---

## 12. Rollout Strategy

### Feature flag policy

- trust layer components may ship behind renderer flags initially
- review workflow must launch in dual-navigation mode before final cutover
- policy guidance should run in shadow mode before replacing existing signal prominence
- ledger operations center can coexist with legacy transaction entry until parity is reached

### Recommended rollout order

1. ship trust metadata in existing surfaces
2. ship new `Today` workflow behind feature flag
3. ship ledger operations center in parallel with legacy transactions
4. run policy guidance in shadow mode while existing signal UI remains visible
5. cut over navigation and recommendation model once parity and confidence are proven

---

## 13. Success Metrics

The redesign should be judged by product behavior, not just code completion.

### Primary metrics

- time to first meaningful insight after app open
- percentage of sessions that reach a review action
- percentage of portfolios with no unresolved ledger exceptions
- percentage of actionable recommendations with explicit rationale viewed
- reduction in user-visible degraded states without explanation

### Secondary metrics

- reduction in top-level navigation complexity
- reduction in duplicate information surfaces
- reduction in size and responsibility concentration of known hot-spot modules

---

## 14. Documentation Maintenance Protocol

Whenever this initiative changes materially:

1. update this plan if sequencing, scope, or success criteria change
2. update the canonical backlog if ticket status, scope, or dependencies change
3. update `context/runtime/ACTIVE_TASK.md` only when work is actively in progress and runtime-specific
4. do not copy backlog history into stable context docs

This plan owns strategy and sequencing.
The backlog owns day-to-day implementation traceability.

---

## 15. Definition Of Success

This redesign is successful when all of the following are true:

- the first screen tells the user what deserves attention now
- every important number and recommendation is explainable and confidence-scored
- recommendations are grounded in portfolio policy, not just raw thresholds
- keeping the portfolio current is a guided workflow, not a maintenance burden
- the codebase can sustain product iteration without relying on a few oversized files

Until then, the app remains strong infrastructure wrapped in an only partially productized experience.

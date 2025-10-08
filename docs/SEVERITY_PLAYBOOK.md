# Severity Matrix + Implementation Playbook
_Generated: 2025-10-08T15:51:03_

This document consolidates a **Severity Matrix (Impact × Probability)** and an **Execution Scoreboard** derived from the artifacts in `audit/personas/*`. It is designed to be **self-executing** for an AI code assistant: you can say _“Read `docs/SEVERITY_PLAYBOOK.md` and proceed with the implementation.”_

## Overview
- **Inputs**: `audit/personas/personas.md`, `audit/personas/journeys.md`, `audit/personas/pains_to_requirements.csv`, `audit/personas/quick_wins.md`, plus any repo code/docs/tests referenced therein.
- **Outputs** (created/maintained by this process):
  - `docs/severity_matrix.csv` — normalized scoring table.
  - `docs/scoreboard.csv` — prioritized backlog with implementation fields.
  - `docs/SEVERITY_PLAYBOOK.md` — this playbook.

---

## Scales & Formulas (use verbatim)

### Impact (1–5)
- **5** = Blocks core flows or corrupts data / wrong money math  
- **4** = Major UX/accuracy issue; frequent user harm / misleading ROI  
- **3** = Noticeable friction or wrong edge-case math; workarounds exist  
- **2** = Minor friction; limited scope impact  
- **1** = Cosmetic / copy only; no measurable harm

### Probability (1–5)
- **5** = Happens to most users, every session or daily  
- **4** = Common in normal usage (weekly)  
- **3** = Occasional (monthly) or persona-specific  
- **2** = Rare edge cases / specific data patterns  
- **1** = Very rare / contrived

### Risk Score
- `risk_score = impact * probability` (range 1–25)

### Confidence (0.5–1.0)
- **1.0** = Evidence strong (reproducible steps + code refs)
- **0.75** = Good signal, minor gaps
- **0.5** = Mostly inferred from personas; weak evidence

### Effort (1–5)
- **1** = ≤2h, **2** = ≤1d, **3** = 1–2d, **4** = 3–5d, **5** = >1w

### Ties & Trade-offs
- Use **ICE = (Impact * Confidence) / Effort** as a tie-breaker.
- Prefer higher `risk_score`; then higher `ICE`.

---

## How to Build the Matrix & Scoreboard

### Step A — Extract pains
- Parse `audit/personas/pains_to_requirements.csv` and `audit/personas/journeys.md`.
- Normalize each pain into a row with a unique **pain_id** and capture all **evidence_refs** (file paths + line ranges, test names, commit SHAs).

### Step B — Score each pain
- Assign **Impact**, **Probability**, **Confidence**, **Effort** per the scales above.
- Compute **risk_score** and **ICE**.

### Step C — Group & de-duplicate
- Merge duplicates (same root cause / same code path). Keep the highest scores and union the evidence list.

### Step D — Prioritize
- Sort by `risk_score` (desc), tie-break with `ICE` (desc), then `Effort` (asc).

### Step E — Map to concrete work
For each top item, propose implementation tasks including:
- Exact files/functions to touch
- Planned diff hints or small code snippets
- Tests to add/update (unit/e2e) with exact test names
- Testable acceptance criteria
- Migration/seed/data notes if applicable

---

## Output Artifacts

### 1) `docs/severity_matrix.csv`
Headers (exactly):
```
pain_id,persona,flow_step,impact,probability,confidence,effort,risk_score,ICE,summary,why_it_hurts,evidence_refs
```

### 2) `docs/scoreboard.csv`
Headers (exactly):
```
rank,pain_id,type(change|bugfix|doc|test),owner,branch,status(todo|in_progress|blocked|done),acceptance_criteria,tests(required),evidence_refs,planned_diff_hint,eta,pr_link
```

---

## Top-N Priorities (live view)
> Populate from `docs/scoreboard.csv` (highest `risk_score`, then `ICE`).

| rank | pain_id | summary | risk_score | ICE | effort | acceptance_criteria |
|---:|---|---|---:|---:|---:|---|
| 1 |  |  |  |  |  |  |
| 2 |  |  |  |  |  |  |
| 3 |  |  |  |  |  |  |
| 4 |  |  |  |  |  |  |
| 5 |  |  |  |  |  |  |

---

## Implementation Checklist (Self‑Executing)

1. **Branch**
   - Create/checkout: `fix/<pain_id>-<slug>`

2. **Apply the planned change**
   - Modify the exact files/functions listed in **planned_diff_hint**.
   - Keep changes minimal and reversible.

3. **Tests**
   - Add/adjust tests listed under **tests(required)**. Make them fail first, then pass.
   - Run coverage and keep/raise thresholds for changed modules.

4. **CI Commands** (use what the repo supports):
   - `npm run lint`  _or_  `pnpm lint`
   - `npm test -- --coverage`  _or_  `pnpm test --coverage`
   - Backend tests (if applicable): `npm run test:server`

5. **Verify Definition of Done (per task)**
   - All **acceptance_criteria** pass
   - New/updated tests green and prove the fix
   - No new lint/TypeScript errors (if TS); build succeeds
   - Screenshots or terminal outputs for user-visible changes

6. **PR & Evidence**
   - Open PR titled: `[FIX] <pain_id> <summary>`
   - Paste: commands run, coverage deltas, and evidence refs
   - Update `docs/scoreboard.csv` (status, branch, PR link, notes)

---

## Definition of Done (per task)
- Acceptance criteria satisfied
- Tests demonstrate the fix and guard regressions
- Build, lint, and type checks pass
- Observability/evidence captured in PR
- Scoreboard updated

---

## Audit Trail
- Keep `docs/scoreboard.csv` current (`status`, `owner`, `branch`, `pr_link`, blockers if any).
- If blocked, record reason + next action and downgrade **Confidence** to `0.5`.

---

## Invocation Snippet (for AI assistant)
> **Run exactly:**  
> “Read `docs/SEVERITY_PLAYBOOK.md`. Execute the ‘Implementation Checklist’ for the top 5 ranked items in `docs/scoreboard.csv`, one by one, opening a separate PR for each. Do not brainstorm features; only implement what’s specified. If evidence is missing for an item, downgrade Confidence to 0.5, mark **blocked**, and proceed to the next item.”

---

## Notes
- No destructive changes (migrations/data wipes) without explicit acceptance criteria and backups.
- Prefer minimal diffs that close the pain with high verification power (tests + observability).

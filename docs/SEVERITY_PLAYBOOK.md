# Severity Matrix & Scoreboard (Live)

This document reflects the latest normalization of persona pains into a ranked backlog. The artifacts are generated from `audit/personas/*` sources per the repository playbook.

- **Matrix data**: [`docs/severity_matrix.csv`](severity_matrix.csv)
- **Prioritized backlog**: [`docs/scoreboard.csv`](scoreboard.csv)

## Top 5 Priorities

| rank | pain_id | summary | risk_score | ICE | effort | acceptance_criteria |
| ---: | --- | --- | ---: | ---: | ---: | --- |
| 1 | P-004 | Cash submissions require a price | 16 | 2.0 | 2 | Submitting a DEPOSIT with blank price succeeds and records the entry. |
| 2 | P-002 | Price fetch failures silently zero holdings | 15 | 1.25 | 3 | Triggering fetchPrices failure leaves previous values on screen and shows a visible error message. |
| 3 | P-001 | Portfolio Controls surface raw HTTP errors | 12 | 1.5 | 2 | Submitting with an invalid key shows a descriptive inline error without raw URL and includes the request ID. |
| 4 | P-006 | ROI fallback runs silently after API errors | 12 | 1.5 | 2 | After forcing a 500 from /returns/daily, the UI shows an error banner and labels fallback ROI data. |
| 5 | P-003 | README references importer that UI lacks | 12 | 1.125 | 2 | Either a Reports importer exists with preview/confirm or README/docs explicitly remove the workflow. |

## How to Execute

1. Checkout the branch listed for the highest priority item in [`docs/scoreboard.csv`](scoreboard.csv) or create it if absent.
2. Implement the scoped diff described in `planned_diff_hint`, keeping changes minimal and reversible.
3. Add or update the tests named in `tests(required)`, ensuring they fail before the fix and pass afterwards.
4. Run the FAST lane quality gates (`npm run lint`, `NO_NETWORK_TESTS=1 npm run test:fast`) unless otherwise instructed.
5. Update the scoreboard row with the new status, ETA adjustments, and PR link when ready.

For blocked items, downgrade the confidence to **0.5**, capture the blocker in the scoreboard `status` notes, and move to the next ranked pain.

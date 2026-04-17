# Documentation Index

The `docs/` directory is now organized by intent so contributors can quickly locate the
right artifact during reviews, incident response, or feature work. Start with this
index when you need supporting material.

## Reference

- [`docs/reference/HARDENING_SCOREBOARD.md`](reference/HARDENING_SCOREBOARD.md) — current
  implementation status with evidence links.
- [`docs/reference/openapi.yaml`](reference/openapi.yaml) — canonical API specification.
- [`docs/reference/QUALITY_GATES.md`](reference/QUALITY_GATES.md) — stable record of the
  quality gates that are actually enforced today.
- [`docs/reference/VALIDATION_MATRIX.md`](reference/VALIDATION_MATRIX.md) — stable contract
  for local validation commands and what each one proves.
- [`docs/reference/SECURITY.md`](reference/SECURITY.md) — incident response, API key policy,
  and security controls.
- [`docs/reference/scoreboard.csv`](reference/scoreboard.csv) /
  [`docs/reference/severity_matrix.csv`](reference/severity_matrix.csv) — machine readable
  backlog datasets.
- [`docs/reference/CHANGELOG.md`](reference/CHANGELOG.md) — release notes and major updates.

## Playbooks

- [`docs/operations/playbooks/testing-strategy.md`](operations/playbooks/testing-strategy.md) — quality gates and
  test execution guidance.
- [`docs/operations/playbooks/frontend-operations.md`](operations/playbooks/frontend-operations.md) — Phase 4 UI
  deployment and incident procedures.
- [`docs/operations/playbooks/severity-playbook.md`](operations/playbooks/severity-playbook.md) — severity scoring
  and remediation workflow.
- [`docs/operations/playbooks/codex-speedup-playbook.md`](operations/playbooks/codex-speedup-playbook.md) — FAST vs
  HEAVY execution modes for automation.
- [`docs/operations/playbooks/p5-test-1-rescue.md`](operations/playbooks/p5-test-1-rescue.md) — recovery checklist
  for Phase 5 regression guardrails.

## Guides

- [`docs/guides/cash-benchmarks.md`](guides/cash-benchmarks.md) — benchmark methodology and
  blended return formulas.
- [`docs/guides/math-policy.md`](guides/math-policy.md) — decimal precision and accounting
  standards enforced across the project.

## Backlog

- [`docs/backlog/per-portfolio-cash-interest-roadmap.md`](backlog/per-portfolio-cash-interest-roadmap.md)
  — cash interest rollout plan.
- [`docs/backlog/portfolio-manager-unified-next-steps.md`](backlog/portfolio-manager-unified-next-steps.md) — open
  phases and next-step backlog.
- [`docs/backlog/professionalization-top-priorities.md`](backlog/professionalization-top-priorities.md) — top
  strategic initiatives for operational maturity.

## Audits

- [`docs/audits/reports/2025-10-05-portfolio-full-audit-v3.md`](audits/reports/2025-10-05-portfolio-full-audit-v3.md) — most recent
  comprehensive audit report (v3).
- [`docs/audits/reports/2025-10-05-hardening-audit.md`](audits/reports/2025-10-05-hardening-audit.md) — security
  hardening verification aligned with the scoreboard.

## Legacy

Historical prompts, superseded audits, and planning documents live under
[`docs/legacy/`](legacy/). Use these for context only; they are no longer part of the
active workflow.

## Architecture Decisions

- [`docs/adr/README.md`](adr/README.md) — index of active ADRs and when to add a new one.

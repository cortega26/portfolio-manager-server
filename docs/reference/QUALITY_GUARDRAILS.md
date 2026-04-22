# Quality Guardrails

This document defines the anti-drift guardrails that keep repository quality
from silently regressing after the current remediation pass.

## Hard-Fail Gates

- `npm run verify:docs`
- `npm run verify:quality`
- `npm run verify:smoke`
- `npm run test:coverage`

`npm run verify:quality` is the canonical repo-wide guardrail for local work and
CI. It must run:

- `npm run doctor`
- `npm run docs:check`
- `npm run lint`
- `npm run verify:typecheck`
- `npm run format:check`
- `npm run codacy:analyze`
- `npm run check:complexity`
- `npm run verify:build`
- `npm test`

## Codacy Policy

- Codacy runs from the repo root through `npm run codacy:analyze`.
- Production `ERROR`s are never allowlisted silently.
- Touched production files may not increase unresolved Codacy warning or error
  counts beyond `.quality/codacy-baseline.json` unless they are explicitly
  documented in `.codacy/allowlist.json`.
- Baselines are updated intentionally with `npm run quality:baseline:update`
  after a reviewed remediation or an explicitly approved debt capture.
- Every allowlist entry must include:
  - `owner`
  - `addedOn`
  - `reason`

## Structural Complexity Policy

- `npm run check:complexity` evaluates touched production files only.
- Tests and docs are excluded from these production-only drift gates.
- File length, function length, and cyclomatic complexity are enforced from the
  Lizard findings produced by Codacy.
- Duplication is enforced locally with a repeated-window heuristic configured in
  `.quality/structural-complexity.json`.
- Thresholds should ratchet down over time. Existing overrides are temporary
  debt markers, not permanent exemptions.

## Maintenance Rules

- Keep allowlists and overrides as small as possible.
- An allowlist entry may stay flat or disappear; it should not grow casually.
- If CI or docs change the enforced commands, update:
  - `docs/reference/QUALITY_GATES.md`
  - `docs/reference/VALIDATION_MATRIX.md`
  - `scripts/check-quality-gates.mjs`
- Stable docs must not drift back to removed Express-era entrypoints.

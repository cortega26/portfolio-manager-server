# BASELINE_STATUS.md

Status: BROKEN
Last verified: 2026-04-16
Verified by: local audit

## Uso

- Este archivo es runtime-only y reemplazable.
- Refleja la salud actual del checkout, no el target ideal del repo.
- Actualizarlo cuando cambie materialmente el estado del baseline.
- Si contradice snapshots históricos en docs estables, confiar en este archivo para el estado actual.

## Commands

- [pass] `npm run doctor`
- [pass] `npm run docs:check`
- [pass] `npm run quality:gates`
- [pass] `npm run lint`
- [pass] `npm run verify:typecheck`
- [fail] `npm test`
- [fail] `npm run format:check`

## Current failures

- `npm test`
  - failing test: `src/__tests__/App.pricingStatus.test.tsx:166`
  - symptom: expected degraded pricing banner text was not found
- `npm run format:check`
  - failing paths before ignore cleanup: `.codacy/cli-config.yaml`, `.codacy/codacy.yaml`, `.codacy/tools-configs/languages-config.yaml`, `.codacy/tools-configs/lizard.yaml`, `.codacy/tools-configs/semgrep.yaml`

## Notes

- The node:test portion of `npm test` completed deep backend coverage before Vitest failed in the frontend suite.
- This file should flip back to `GREEN` only after rerunning the failing commands on an unchanged checkout and confirming zero failures.

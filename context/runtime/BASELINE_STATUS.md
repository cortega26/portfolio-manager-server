# BASELINE_STATUS.md

Status: GREEN
Last verified: 2026-04-22
Verified by: Quality remediation

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
- [pass] `npm test`
- [pass] `npm run format:check`

## Current failures

- none

## Notes

- `npm test` (node:test + vitest) both pass: 358 node tests, 86 vitest tests, 0 failures.
- Baseline flipped GREEN after Phase 1 implementation (2026-04-20).
- Test counts after Phase 1:

| Runner    | Command             | Pass | Fail | Skip |
| --------- | ------------------- | ---- | ---- | ---- |
| node:test | `npm run test:node` | 358  | 0    | 11   |
| vitest    | `vitest run`        | 86   | 0    | 0    |

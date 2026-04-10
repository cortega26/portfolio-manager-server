# ACTIVE_TASK.md

Status: IN-PROGRESS
Last updated: 2026-04-10
Task type: cleanup + feature
Owner: Antigravity

## Uso

- Este archivo es runtime-only y reemplazable.
- Mantenerlo corto y centrado en una sola tarea activa.
- Marcar cada bullet como `[confirmed]` o `[hypothesis]`.
- Reescribirlo cuando cambie materialmente la tarea; no acumular drift.
- Enlazar a `status` o `backlog` si hace falta contexto amplio, en vez de copiarlo.
- No copiar aquí reglas estables de `AGENTS.md` o `context/*.md`.
- No guardar historiales de chat, logs largos ni changelogs.

## Objective

- [confirmed] Completar la migración de R1+R2 al repositorio unificado desktop, cerrando deuda técnica y features pendientes.
- [confirmed] Phase A (dead code cleanup) completada. Phase C (documentación) en progreso.

## Success criteria

- [confirmed] Zero código muerto de la era R1 pública (bruteForce, rateLimit, auditLog, AdminTab, apiKey eliminados).
- [confirmed] Zero test failures tras cleanup.
- [confirmed] README, .env.example y MODULE_INDEX reflejan la realidad desktop.
- [hypothesis] Signal notifications (email via nodemailer) integradas con el scheduler (Phase B — pending).
- [hypothesis] Electron packaging via electron-builder funcional (Phase D — pending).

## In scope

- [confirmed] Eliminación de 16 archivos zombi (Phase A — DONE)
- [confirmed] Limpieza de 13 archivos fuente/test (Phase A — DONE)
- [confirmed] Rewrite de README.md, .env.example, MODULE_INDEX.md (Phase C — IN PROGRESS)
- [confirmed] Actualización de status y backlog docs (Phase C)
- [hypothesis] Email notifier port from R2 (Phase B — QUEUED)
- [hypothesis] Electron-builder config (Phase D — QUEUED)

## Confirmed facts

- [confirmed] Phase A cerrada: node:test 325 pass, Vitest 79 pass, coverage 56.19%.
- [confirmed] Package renombrado a `portfolio-manager-unified`.
- [confirmed] `express-rate-limit` eliminado de dependencias.
- [confirmed] CI simplificado: removido Playwright admin check y deploy.yml.
- [confirmed] TailwindCSS está en uso activo en el frontend.
- [confirmed] Config sigue siendo `.env` + `server/config.js` (no YAML).

## Open hypotheses / unknowns

- [hypothesis] El canal de notificaciones será batch desde el scheduler nocturno (Option A del plan).
- [hypothesis] `server/config.js` aún parsea variables muertas (bruteForce, auditLog, rateLimit) — harmless pero cleanup deseable.

## Verification plan

- [confirmed] `npm test` para validar cada fase.

## Risks / blockers

- [confirmed] No hay blockers activos.

## Decision log

- [confirmed] AdminTab removido permanentemente — si se necesita diagnóstico desktop, se construirá desde cero con datos relevantes.
- [confirmed] deploy.yml eliminado — el proyecto es desktop-only.
- [confirmed] TailwindCSS se mantiene (está en uso activo).
- [confirmed] Config sigue en `.env` + `server/config.js`.

## Handoff

- [confirmed] Siguiente paso: completar Phase C (status + backlog docs), luego Phase B (signal notifications).

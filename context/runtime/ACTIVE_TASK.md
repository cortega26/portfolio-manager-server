# ACTIVE_TASK.md

Status: IN-PROGRESS
Last updated: 2026-04-14
Task type: feature
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

- [confirmed] Resolver el primer bloque operativo pendiente del backlog de alertas: mover las transiciones de señales a una base backend persistente integrada al scheduler.
- [confirmed] Dejar email como siguiente capa sobre una cola/estado backend ya persistido, sin duplicar lógica en renderer.

## Success criteria

- [confirmed] `daily_close` persiste estado backend de señales y crea eventos accionables idempotentes por portafolio/ticker.
- [confirmed] Existe lectura API mínima para inspeccionar alertas persistidas por portafolio.
- [confirmed] `npm test` permanece verde tras introducir migración y tablas nuevas.
- [hypothesis] La siguiente iteración añadirá delivery real por email sobre el estado `pending/disabled` ya persistido.

## In scope

- [confirmed] Nuevo servicio `server/services/signalNotifications.js` para evaluar filas de señales y persistir transiciones backend.
- [confirmed] Migración `008_signal_notifications` para `signal_notification_states` y `signal_notifications`.
- [confirmed] Integración del flujo persistente en `server/jobs/daily_close.js`.
- [confirmed] Endpoint `GET /api/portfolio/:id/signal-notifications`.
- [hypothesis] Siguiente bloque: worker/email sender y política de retries/acknowledgement.

## Confirmed facts

- [confirmed] El baseline sigue verde tras el bloque backend de alertas: `node:test` 328 pass, 0 fail, 1 skipped; Vitest 79 pass, 0 fail.
- [confirmed] Las notificaciones persistidas hoy se disparan solo para transiciones accionables (`BUY_ZONE`, `TRIM_ZONE`).
- [confirmed] El delivery email queda marcado como `pending` o `disabled`, pero aún no hay emisor real.
- [confirmed] El renderer sigue usando preview/toasts locales; la persistencia backend quedó desacoplada y preparada para el siguiente paso.

## Open hypotheses / unknowns

- [hypothesis] El envío real por email conviene correr en batch desde el scheduler nocturno, reutilizando `signal_notifications`.
- [hypothesis] Hará falta un estado explícito de ack/read si luego se expone una bandeja de alertas en la UI.
- [hypothesis] `server/config.js` aún parsea variables muertas (bruteForce, auditLog, rateLimit) — cleanup aparte, no bloqueante.

## Verification plan

- [confirmed] `npm test` como baseline obligatorio por bloque.
- [confirmed] Tests nuevos de job e integración para transición persistente + lectura API.

## Risks / blockers

- [confirmed] No hay blockers activos.
- [hypothesis] Si el siguiente bloque añade envío real por email, habrá que decidir configuración/env y política de fallos sin romper el modo desktop-first.

## Decision log

- [confirmed] El backlog de alertas se agrupa operativamente así: 1) persistencia backend + scheduler, 2) delivery email, 3) UI inbox/ack si sigue siendo necesario.
- [confirmed] La primera agrupación se implementa sin introducir `nodemailer` todavía, para no mezclar motor de eventos con transporte.
- [confirmed] Las alertas backend se generan desde `daily_close`, no desde renderer.

## Handoff

- [confirmed] Siguiente paso recomendado: implementar sender email sobre `signal_notifications.delivery.email.status`.
- [confirmed] Packaging `electron-builder` sigue pendiente y queda mejor como bloque separado después de cerrar email/alerting.

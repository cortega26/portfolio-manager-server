# ACTIVE_TASK.md

Status: COMPLETED
Last updated: 2026-05-21
Task type: feature
Owner: Antigravity

## Objective

- [confirmed] Resolver el primer bloque operativo pendiente del backlog de alertas: mover las transiciones de señales a una base backend persistente integrada al scheduler.
- [confirmed] Dejar email como siguiente capa sobre una cola/estado backend ya persistido, sin duplicar lógica en renderer.
- [confirmed] Implementar y configurar el servicio de email con Nodemailer, reintentos, y control de estado de entrega.

## Success criteria

- [confirmed] `daily_close` persiste estado backend de señales y crea eventos accionables idempotentes por portafolio/ticker.
- [confirmed] Existe lectura API mínima para inspeccionar alertas persistidas por portafolio.
- [confirmed] `npm test` permanece verde tras introducir migración y tablas nuevas.
- [confirmed] El delivery real por email sobre el estado `pending/disabled` está completamente implementado y testeado.

## In scope

- [confirmed] Nuevo servicio `server/services/signalNotifications.js` para evaluar filas de señales y persistir transiciones backend.
- [confirmed] Migración `008_signal_notifications` para `signal_notification_states` y `signal_notifications`.
- [confirmed] Integración del flujo persistente en `server/jobs/daily_close.js`.
- [confirmed] Endpoint `GET /api/portfolio/:id/signal-notifications`.
- [confirmed] Servicio de correo `server/services/signalNotificationEmail.js` con reintentos y política de backoff.

## Confirmed facts

- [confirmed] El baseline de tests está verde: `npm run test:node` y Vitest completan exitosamente.
- [confirmed] Las notificaciones persistidas se disparan solo para transiciones accionables (`BUY_ZONE`, `TRIM_ZONE`).
- [confirmed] El delivery email está completamente configurado y es activado/desactivado según la configuración del portafolio.
- [confirmed] El renderer usa preview/toasts locales y lee la configuración persistida del backend.

## Verification plan

- [confirmed] `npm test` como baseline obligatorio por bloque.
- [confirmed] Tests unitarios y de integración para la persistencia de alertas, envío de email y reintentos.

## Handoff

- [confirmed] El trabajo para las alertas backend persistentes y el canal de email (Fase 5/5C y partes de Fase 6) está totalmente completado y validado.
- [confirmed] El empaquetado (`electron-builder`) y la integración continua del empaquetado (Fase 8) siguen pendientes como la siguiente meta principal.

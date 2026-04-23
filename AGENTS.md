# AGENTS.md

## Propósito

Este repositorio mantiene `portfolio-manager-unified` como una aplicación desktop local basada en:

- React + Vite en renderer
- Fastify como API local
- Electron como shell desktop
- SQLite como persistencia

R1 (`portfolio-manager-server`) es la base obligatoria.
R2 (`mi_portfolio`) solo aporta funcionalidades selectivas adaptadas al diseño real de R1.

Este archivo es el hub canónico de contexto. No es una wiki.

## Qué vive en cada documento

- Comandos operativos rápidos para agentes: `AGENTS_QUICKSTART.md`
- Reglas operativas de trabajo: `context/CONSTRAINTS.md`
- Invariantes confirmados del proyecto: `context/KNOWN_INVARIANTS.md`
- Boundaries y flujos del sistema (con diagrama): `context/ARCHITECTURE.md`
- Mapa de módulos y entrypoints: `context/MODULE_INDEX.md`
- Atajos por tipo de tarea: `context/TASK_ENTRYPOINTS.md`
- Trabajo activo, hipótesis y verificación: `context/runtime/ACTIVE_TASK.md`
- Decisiones de arquitectura: `docs/adr/`
- Estado amplio y backlog: `docs/reference/portfolio-manager-unified-status.md` y `docs/backlog/portfolio-manager-unified-next-steps.md`

Un link no implica autoload.
Carga solo lo que el tipo de tarea necesite.

## Orden de precedencia

1. Instrucciones explícitas del usuario
2. `AGENTS.md`
3. `AGENTS_QUICKSTART.md` (comandos operativos; anula `docs/meta/automation/agents-playbook.md`)
4. Código real, tests, `package.json` y configuración observable
5. `context/KNOWN_INVARIANTS.md`
6. `context/CONSTRAINTS.md`
7. `context/ARCHITECTURE.md`
8. `context/MODULE_INDEX.md`
9. `context/TASK_ENTRYPOINTS.md`
10. `context/runtime/ACTIVE_TASK.md`
11. `docs/reference/portfolio-manager-unified-status.md`
12. `docs/backlog/portfolio-manager-unified-next-steps.md`

Reglas de resolución:

- Si cualquier documento del punto 4 al 10 contradice el punto 3, primero verificar el código real.
- Si un hecho es temporal, no promoverlo a un documento estable.
- Si una tarea tiene contexto específico vigente, usar `ACTIVE_TASK.md` solo para esa tarea, no como verdad general del repo.

## Política de carga

### Siempre

- `AGENTS.md`

### Nuevas features

- `context/CONSTRAINTS.md`
- `context/KNOWN_INVARIANTS.md`
- `context/ARCHITECTURE.md`
- `context/MODULE_INDEX.md`
- `context/TASK_ENTRYPOINTS.md` si necesitas aterrizar rápido por tipo de flujo antes de buscar
- `context/runtime/ACTIVE_TASK.md` solo si ya existe trabajo en curso relacionado
- `docs/reference/portfolio-manager-unified-status.md` y `docs/backlog/portfolio-manager-unified-next-steps.md` solo si la feature depende del estado actual o de una fase abierta

### Bugs

- `context/CONSTRAINTS.md`
- `context/KNOWN_INVARIANTS.md`
- `context/MODULE_INDEX.md`
- `context/TASK_ENTRYPOINTS.md`
- `context/runtime/ACTIVE_TASK.md`
- `context/ARCHITECTURE.md` solo si el bug cruza Electron, auth, storage o boundaries de proceso

### Refactors

- `context/CONSTRAINTS.md`
- `context/ARCHITECTURE.md`
- `context/MODULE_INDEX.md`
- `context/TASK_ENTRYPOINTS.md`
- `context/KNOWN_INVARIANTS.md` solo si toca finanzas, importación, auth, storage o contratos críticos

### Auditorías

- `context/CONSTRAINTS.md`
- `context/KNOWN_INVARIANTS.md`
- `context/ARCHITECTURE.md`
- `context/MODULE_INDEX.md`
- `context/TASK_ENTRYPOINTS.md` si la auditoría necesita starting points por flujo
- `context/runtime/ACTIVE_TASK.md` solo si la auditoría está acotada a un incidente o cambio activo

## Reglas mínimas

- Inspeccionar código real y tests antes de proponer cambios.
- Mantener cambios pequeños, trazables y reversibles.
- Validar con `npm test` después de cambios relevantes.
- Detenerse si el baseline está roto o si un invariante crítico queda comprometido.
- No asumir que documentación previa refleja el estado real si contradice el código.
- Marcar hipótesis y hechos confirmados por separado cuando la tarea dependa de contexto runtime.

## Tooling

- Si no está disponible, hacer inspección dirigida del repo y citar la limitación.
- La disponibilidad de tooling no es una verdad estable del proyecto.

## Higiene documental

- No duplicar reglas entre archivos.
- No guardar historial conversacional en documentos estables.
- No convertir `ACTIVE_TASK.md` en backlog ni changelog.
- Usar `status` y `backlog` como contexto amplio, no como autoload universal.

<claude-mem-context>
# Memory Context

# [portafolio-unificado] recent context, 2026-04-23 7:01pm GMT-4

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (20,168t read) | 469,670t work | 96% savings

### Apr 22, 2026

165 10:43a 🔴 console.log Removed from formatDate — Shared Utility Extracted to server/utils/dateUtils.ts
166 " 🔄 API_BASE Centralized into src/lib/apiClient.ts — 5-Way Duplication Eliminated
167 " 🔄 mapRowToTrade Helper Extracted in server/db/reader.ts
168 " 🔴 Silent Error Swallowing Fixed in All 5 Express Route Handlers
171 10:45a 🔵 portafolio-unificado — Context Docs Reveal Far Richer Architecture Than TypeScript Files Suggest
172 10:46a 🔵 PortfolioManagerApp.jsx Confirmed as Mega-Component — 1700+ Lines, 30+ State Vars, 12+ useEffects
173 10:47a 🔵 server/app.js and server/routes/index.js Are Near-Identical Duplicates — Both 897 Lines
174 10:50a 🔄 server/routes/\_helpers.ts Created — Shared Route Utilities Extracted from 3 Duplicating Route Files
175 10:51a 🔄 server/routes/\_helpers.ts Patch Successfully Applied — 4 Files Updated Atomically

### Apr 23, 2026

220 6:26p 🔵 portafolio-unificado — Partial Audit Implementation State at Session Resume
221 6:27p 🔵 portafolio-unificado — E2E Baseline Run Reveals Build Error and 2 Failing Tests
222 6:28p 🔵 portafolio-unificado — Full E2E Baseline: 5 Failures, 2 Skipped, 2 Passed
223 " 🔵 portafolio-unificado — SR-021 Today Shell Left Incomplete: apiGet Missing Export Is Root Cause
224 6:29p 🔵 portafolio-unificado — SR-021 Today Shell Architecture: Full Wiring Mapped, apiGet is Only Missing Piece
225 " 🔵 portafolio-unificado — SR-021 Today Shell Partially Implemented, Vite Build Broken by Missing apiGet Export
226 6:30p 🔄 TodayTab sessionToken Prop Removed — PortfolioHealthBar Auth Decoupled from Parent
227 " 🔴 today-shell E2E Tests Fixed — Today Tab Role Is "tab" Not "button"
228 " 🔴 today-shell E2E Suite Now 5/5 Green After Role Selector Fix
229 " 🔵 bootstrap-auth-recovery E2E — Expected Recovery Message Text Confirmed in Test File
230 6:31p 🔵 portafolio-unificado — Policy Evaluator, Trust System, and PortfolioHealth Backend Already Fully Implemented
231 " 🔵 portafolio-unificado — Redesign Audit: Actual Implementation Status Mapped Against spec.md
232 6:32p 🔴 bootstrap-auth-recovery E2E URL Intercept Pattern Fixed
233 " 🔵 bootstrap-auth-recovery Test Still Fails — App Renders Normal Desktop View Instead of Error
234 6:33p 🔴 Bootstrap Load Ref Race Condition Fixed in PortfolioManagerApp.jsx
235 " ✅ Full E2E Suite Now 9/9 Green — portafolio-unificado Audit Complete
236 6:34p ✅ Full Unit + Vitest Test Suite Passes — 447/448 Node Tests Green, 0 Failures
237 " 🔵 ESLint Fails with 7 Errors — cancelled Undefined in usePortfolioData.js Plus 4 Unused Vars
238 " 🔴 All 7 ESLint Errors Fixed Across 4 Files
239 " ✅ portafolio-unificado Audit Complete — Tests, E2E, and Lint All Green
240 6:36p ✅ portafolio-unificado All Quality Gates Pass — Tests, Lint, and TypeCheck Green
241 6:39p 🔵 portafolio-unificado — InboxTab and TrustBadge Components Confirmed Implemented
242 " 🟣 InboxTab — InboxItemCard Now Renders Optional rationale Field
243 " ✅ vitest.config.ts — tests/redesign TypeScript Tests Added to Vitest Include Pattern
244 " 🟣 SR-004 TrustBadge and TrustTooltip Unit Tests Created
245 " 🟣 SR-006 InboxRationale Unit Test Created
246 6:40p 🔵 portafolio-unificado — vitest Must Be Invoked via npx or npm run, Not Directly
247 " 🔴 TrustTooltip Test — Raw dispatchEvent mouseenter Replaced with fireEvent.mouseEnter
248 " ✅ SR-004/SR-006 New Tests — 4/4 Passing After fireEvent Fix
249 " 🟣 inboxComputer Server Test — rationale Field Assertion Added for THRESHOLD_TRIGGERED
250 " ✅ todo.md — SR-004 and SR-006 Audit Items Marked Complete
251 6:41p ✅ Full Test Suite Green — 447/448 Node Tests + 92/92 Vitest Tests After SR-004/SR-006 Changes
252 " ✅ All Three Quality Gates Green — Tests, Lint, and TypeCheck Pass After SR-004/SR-006 Session
253 " ✅ E2E Suite — 9/9 Playwright Tests Pass After SR-004/SR-006 Audit Session Changes
254 6:42p 🔴 portafolio-unificado — Full Uncommitted Work Inventory: 19 Modified + 15 Untracked Files
255 6:43p 🔵 portafolio-unificado — Open Audit Items Inventory for M1/M2 Sprint
256 6:44p 🔵 portafolio-unificado — Current State of SR-021/022/023/024 Today Shell Components
257 " 🔵 portafolio-unificado — SR-001 Trust Schema Contract and SR-002 Health Endpoint Logic Confirmed from spec.md
258 6:46p 🟣 SR-001: Trust Schema Extended with eod_estimated, manual, expired, and DegradedReason
259 6:47p 🟣 portfolioHealth.ts — SR-002 Freshness Logic Implemented with Real Trading Day Age
260 6:48p 🟣 SR-021/022/024 — Today-Level Health States and NeedsAttention Top-5 Filter Implemented

Access 470k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>

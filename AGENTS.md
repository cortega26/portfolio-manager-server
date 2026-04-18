# AGENTS.md

## Propósito

Este repositorio mantiene `portfolio-manager-unified` como una aplicación desktop local basada en:

- React + Vite en renderer
- Express como API local
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

# [portafolio-unificado] recent context, 2026-04-17 8:55pm GMT-4

No previous sessions found.
</claude-mem-context>

# CONSTRAINTS.md

Carga este archivo cuando la tarea implique implementar, corregir, refactorizar o auditar cambios reales.

## Propósito

Este archivo define cómo se trabaja en el repo.
No guarda verdades de dominio ni estado temporal del proyecto.

## Antes de editar

- Leer los archivos y tests realmente afectados.
- Verificar contratos, rutas, storage y entrypoints observables.
- Preferir integraciones existentes sobre wrappers o capas paralelas nuevas.
- Si `npm ci` o `npm test` ya fallan antes de empezar, detenerse y reportar.

## Durante la implementación

- Mantener cada cambio con una sola intención principal.
- Priorizar compatibilidad y ausencia de regresión sobre velocidad.
- No mezclar limpieza cosmética con cambios críticos.
- Justificar cualquier abstracción nueva por reducción real de complejidad.
- Mantener separación clara entre:
  - Electron `main`
  - Electron `preload`
  - renderer
  - backend Express
  - acceso a datos

## Validación mínima

Después de cambios relevantes:

```bash
npm test
```

## Validación adicional por área

- Desktop auth:
  - session token por proceso funcional
  - renderer sin acceso a secretos ni SQLite
- SQLite y storage:
  - payloads y semántica observables preservadas
  - sin regresiones de lectura/escritura
- Importador CSV:
  - `--dry-run` sin side effects
  - idempotencia real
  - reglas de reconciliación explícitas y testeadas
- Electron:
  - arranque local estable
  - preload como único bridge seguro

## Stop conditions

Detenerse y reportar si ocurre cualquiera de estas:

- baseline roto antes de empezar
- el código contradice una premisa estructural importante
- el cambio rompe contratos observables o tests existentes sin aprobación explícita
- se degrada idempotencia, reconciliación, auth local o boundary renderer/SQLite
- la fase actual quedaría parcialmente rota

Al detenerse, reportar:

- causa concreta
- archivo, test o contrato afectado
- corrección mínima razonable

## Formato de reporte

Al cerrar un bloque relevante, usar:

### Qué verifiqué

### Qué cambié

### Qué validé

### Estado

Estados permitidos:

- `PASS`
- `PARTIAL`
- `BLOCKED`

## Higiene de contexto

- Reglas estables de dominio viven en `context/KNOWN_INVARIANTS.md`.
- Mapa de código vive en `context/MODULE_INDEX.md`.
- Boundaries y flujo sistémico viven en `context/ARCHITECTURE.md`.
- Contexto efímero de la tarea vive en `context/runtime/ACTIVE_TASK.md`.
- No repetir la misma regla en múltiples documentos.

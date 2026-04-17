# Migración: Express (JS) → Fastify + TypeScript

**Estado:** [ ] No iniciado [ ] En progreso [x] Completo

---

## Qué es esto

Plan ejecutable para migrar el backend de `portfolio-manager-unified` desde Express en JavaScript puro hacia Fastify con TypeScript estricto. La migración es incremental: el servidor funciona en cada commit, los tests pasan en cada fase, Electron no se toca.

---

## Estructura de este directorio

```
docs/migration/
├── README.md               ← este archivo — overview y navegación
├── PROGRESS.md             ← tracker de tareas con checkboxes (editar durante ejecución)
├── phases/
│   ├── phase-0-tooling.md  ← instalar toolchain sin romper nada
│   ├── phase-1-domain-types.md  ← tipar módulos de dominio puro
│   ├── phase-2-fastify-shadow.md ← app Fastify paralela a Express
│   ├── phase-3-test-migration.md ← migrar los 43 tests al nuevo app
│   ├── phase-4-cutover.md  ← reemplazar Express en producción
│   └── phase-5-hardening.md ← strict mode completo, tipos nominales
└── reference/
    ├── invariants.md        ← qué nunca puede romperse
    ├── route-map.md         ← mapa completo Express → Fastify
    └── type-catalog.md      ← catálogo de tipos a definir por módulo
```

---

## Cronograma estimado

| Fase      | Nombre               | Horas est.  | Riesgo |
| --------- | -------------------- | ----------- | ------ |
| 0         | Fundación tooling    | 2–3 h       | Bajo   |
| 1         | Tipos de dominio     | 4–6 h       | Bajo   |
| 2         | App Fastify (shadow) | 6–8 h       | Medio  |
| 3         | Migración de tests   | 2–3 h       | Bajo   |
| 4         | Cutover              | 1–2 h       | Medio  |
| 5         | Hardening TypeScript | 2–3 h       | Bajo   |
| **Total** |                      | **17–25 h** |        |

---

## Principios del plan

1. **Zero downtime por fase** — cada fase termina con `npm test` verde y Electron funcional.
2. **Inside-out** — los módulos sin acoplamiento HTTP se tipan primero (`finance/`, `config`, `cache`), la capa de transporte al final.
3. **Shadow app** — `app.fastify.ts` coexiste con `app.js` hasta que todas las rutas están migradas y testeadas.
4. **Test-first por ruta** — cada ruta migrada se valida contra los tests existentes antes de avanzar a la siguiente.
5. **Sin reescritura de dominio** — `server/finance/`, `server/import/`, `server/jobs/` solo reciben tipos, nunca se cambia la lógica.
6. **Electron intocable** — `electron/main.cjs` y `electron/preload.cjs` no se modifican en ninguna fase.

---

## Gate de Go/No-Go (antes de cada fase)

Verificar siempre antes de iniciar una nueva fase:

```bash
npm test                  # todos los tests verdes
npm run lint              # cero warnings
npm run verify:typecheck  # typecheck del renderer pasa
npm run electron:smoke    # Electron arranca y carga la UI
```

Si cualquiera falla: **no avanzar**. Resolver primero.

---

## Dependencias nuevas que se instalan

### Runtime

```bash
npm install fastify @fastify/cors @fastify/helmet @fastify/compress \
  fastify-type-provider-zod
```

### Dev

```bash
npm install -D @types/node tsx
```

> `zod` ya está instalado en el proyecto. No instalar de nuevo.
> `pino` ya está instalado. Fastify lo usa nativamente.

---

## Archivos que NO se tocan en ninguna fase

| Archivo                        | Razón                                               |
| ------------------------------ | --------------------------------------------------- |
| `electron/main.cjs`            | IPC — interfaz con startServer no cambia            |
| `electron/preload.cjs`         | Bridge — no conoce Express ni Fastify               |
| `electron/runtimeConfig.js`    | Config de runtime Electron                          |
| `shared/`                      | Contratos compartidos renderer↔backend             |
| `src/`                         | Frontend React — fuera de scope                     |
| `server/finance/*.js` → `*.ts` | Lógica financiera — solo se tipan, no se reescriben |
| `server/migrations/index.js`   | Schema SQLite — no tiene coupling HTTP              |

---

## Cómo usar este directorio durante la ejecución

1. Leer `reference/invariants.md` antes de empezar (tarda 5 min, evita errores graves).
2. Abrir `PROGRESS.md` y usarlo como tracker en tiempo real — marcar cada tarea al completarla.
3. Para cada fase, leer el archivo `phases/phase-N-*.md` completo antes de ejecutar el primer comando.
4. Ante cualquier duda sobre una ruta, consultar `reference/route-map.md`.
5. Ante cualquier duda sobre un tipo, consultar `reference/type-catalog.md`.

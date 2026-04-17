# Fase 4 — Cutover

**Objetivo:** Activar Fastify en producción. Express deja de ser el entrypoint. Limpiar todos los artefactos de Express.
**Duración estimada:** 1–2 horas
**Riesgo:** Medio (toca el runtime de producción)
**Prerequisito:** Fase 3 completada. Los 43 tests pasan contra Fastify. `electron:smoke` pasa.

---

## Verificación pre-cutover

Antes de tocar cualquier archivo, ejecutar la batería completa:

```bash
npm test                    # Todos verdes contra Fastify
npm run verify:typecheck:server
npm run lint
npm run electron:smoke      # Electron arranca con Express (último momento)
```

Si cualquiera falla: **no continuar**. Resolver primero.

---

## 4.1 — Actualizar `server/runtime/startServer.js`

Este es el único archivo que necesita cambiar para activar Fastify en producción.

Leer el archivo actual primero. El cambio es mínimo: reemplazar la importación de `createApp` (Express) por `createFastifyApp`.

**Antes:**

```javascript
import { createApp } from '../app.js';
// ...
const app = createApp({ dataDir, fetchImpl, logger, ... });
app.listen({ port, host }, (err) => { ... });
```

**Después:**

```javascript
import { createFastifyApp } from '../app.fastify.js';
// ...
const app = await createFastifyApp({ dataDir, fetchImpl, logger, ... });
await app.listen({ port, host: '127.0.0.1' });
```

**Diferencia clave de API Express → Fastify:**

- Express: `app.listen(port, host, callback)` — callback-based
- Fastify: `await app.listen({ port, host })` — promise-based

El contrato externo de `startServer()` no cambia — Electron llama a `startServer()` y no le importa el framework adentro.

---

## 4.2 — Verificar que Electron arranca con Fastify

```bash
npm run electron:smoke
```

Esto ejecuta el build completo y levanta Electron. Si el servidor arranca y la UI carga: **green light** para continuar.

Si falla aquí: revisar los logs del proceso Electron, identificar el error y corregirlo antes de continuar con la limpieza.

---

## 4.3 — Verificación manual en modo dev

```bash
npm run electron:dev
```

Abrir la app y verificar manualmente:

- [ ] La UI carga correctamente
- [ ] Se puede ver el portfolio (si existe uno)
- [ ] Los precios se cargan
- [ ] No hay errores en la consola de DevTools

---

## 4.4 — Desinstalar Express y sus middleware

```bash
npm uninstall express compression cors helmet
```

> **CRÍTICO:** Ejecutar `codacy_cli_analyze` con trivy inmediatamente después.

Verificar que `npm test` sigue verde:

```bash
npm test
```

---

## 4.5 — Eliminar `server/app.js`

```bash
rm server/app.js
```

Verificar que no hay imports residuales:

```bash
grep -r "from.*app\.js" server/ --include="*.js" --include="*.ts"
grep -r "require.*app\.js" server/
```

Correr tests:

```bash
npm test
```

---

## 4.6 — Eliminar middleware Express

```bash
rm server/middleware/validation.js
rm server/middleware/sessionAuth.js
rm server/middleware/requestContext.js
```

Verificar imports residuales:

```bash
grep -r "middleware/" server/ --include="*.js" --include="*.ts"
```

Si algún archivo importa de `middleware/`, actualizarlo para importar desde el plugin/schema Fastify equivalente.

---

## 4.7 — Eliminar archivos `.js` de dominio que tienen su par `.ts`

Para cada par `X.js` / `X.ts`, eliminar el `.js`:

```bash
# Solo si el .ts correspondiente existe
rm server/config.js           # si server/config.ts existe
rm server/finance/decimal.js  # si server/finance/decimal.ts existe
rm server/finance/cash.js     # si server/finance/cash.ts existe
rm server/finance/portfolio.js
rm server/finance/returns.js
rm server/auth/localPinAuth.js
rm server/cache/priceCache.js
```

**Verificación después de cada eliminación:**

```bash
npm run verify:typecheck:server
npm test
```

Si algún test falla tras eliminar un `.js`: un módulo importa el `.js` directo. Encontrar el import y actualizarlo al `.ts` (extensión `.js` en NodeNext).

---

## 4.8 — Verificación post-limpieza completa

```bash
# Todo el proyecto limpio
npm run verify:typecheck:server
npm run verify:typecheck        # Frontend también
npm run lint
npm test
npm run electron:smoke
```

---

## 4.9 — Limpiar `package.json` de dependencias Express

Verificar que no queden referencias:

```bash
grep -E '"express"|"compression"|"cors"|"helmet"|"supertest"' package.json
```

Si quedan, eliminarlas manualmente de `dependencies`/`devDependencies`.

---

## 4.10 — Verificar que `electron/main.cjs` sigue intacto

```bash
git diff electron/main.cjs
```

**Debe mostrar cero cambios.** Si hay algún diff: algo salió mal. Revertir con `git checkout electron/main.cjs`.

---

## Rollback plan

Si en cualquier punto de esta fase hay un error crítico y no se puede resolver rápido:

```bash
# Revertir el runtime al Express original
git checkout server/runtime/startServer.js

# Los archivos .js eliminados se recuperan desde git
git checkout server/app.js
git checkout server/middleware/
```

Esto restaura Express sin tocar los nuevos archivos Fastify. Los tests de Express seguirán fallando (ya están migrados), pero el runtime de Electron volverá a funcionar.

---

## Commit de cierre de Fase 4

```bash
git add -A
git commit -m "feat!: activate fastify in production, remove express

BREAKING CHANGE: server now uses Fastify instead of Express

- Update server/runtime/startServer.js to use createFastifyApp
- Remove server/app.js (Express factory)
- Remove server/middleware/ (replaced by Fastify plugins)
- Uninstall express, compression, cors, helmet, supertest
- Remove .js domain files that have .ts counterparts
- All 43 tests green, electron:smoke passes
- electron/main.cjs unchanged"
```

---

## Siguiente paso

→ [Phase 5 — TypeScript Hardening](./phase-5-hardening.md)

# Fase 0 — Fundación Tooling

**Objetivo:** Instalar el toolchain TypeScript + Fastify sin romper nada existente.
**Duración estimada:** 2–3 horas
**Riesgo:** Bajo
**Prerequisito:** `npm test` verde, `npm run electron:smoke` pasa.

---

## 0.1 — Instalar dependencias runtime

```bash
npm install fastify @fastify/cors @fastify/helmet @fastify/compress \
  fastify-type-provider-zod
```

> **CRÍTICO tras este comando:** ejecutar Codacy CLI con trivy antes de continuar.
>
> ```bash
> # Si Codacy CLI está disponible — ejecutar vía MCP tool:
> # codacy_cli_analyze con tool=trivy, rootPath=/home/carlos/VS_Code_Projects/portafolio-unificado
> ```
>
> Si hay vulnerabilidades: resolverlas antes de continuar a 0.2.

**Notas sobre cada paquete:**

- `fastify` — framework HTTP principal, incluye pino como logger nativo.
- `@fastify/cors` — reemplaza el middleware `cors` de Express.
- `@fastify/helmet` — reemplaza `helmet` de Express; misma API de CSP.
- `@fastify/compress` — reemplaza `compression` de Express.
- `fastify-type-provider-zod` — integra los schemas Zod como tipos TypeScript end-to-end en rutas.

**Paquetes que NO se instalan (ya existen):**

- `zod` — ya en `dependencies`.
- `pino` y `pino-http` — ya en `dependencies`; Fastify usa pino nativamente, no necesita plugin extra.

---

## 0.2 — Instalar dependencias dev

```bash
npm install -D @types/node tsx
```

**Notas:**

- `@types/node` — tipos de Node.js para el servidor TypeScript.
- `tsx` — ejecutor TypeScript para scripts utilitarios durante la migración (no es parte del build final).

---

## 0.3 — Crear `tsconfig.server.json`

Crear en la raíz del proyecto (junto a `tsconfig.json` existente):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./server-dist",
    "rootDir": "./server",
    "strict": true,
    "noUncheckedIndexedAccess": false,
    "exactOptionalPropertyTypes": false,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["server/**/*.ts"],
  "exclude": ["server/__tests__/**", "node_modules", "server-dist"]
}
```

**Por qué `module: NodeNext`:**
El proyecto ya usa `"type": "module"` en `package.json`. NodeNext es el único modo de TypeScript que respeta correctamente los imports ESM con extensiones explícitas (`.js` que resuelven a `.ts`). Esto permite coexistencia de archivos `.ts` nuevos con archivos `.js` existentes sin conflicto.

**Por qué `noUncheckedIndexedAccess: false` y `exactOptionalPropertyTypes: false` inicialmente:**
Estos se activan en la Fase 5 (Hardening). Activarlos en Fase 0 generaría cientos de errores en archivos que aún no han sido migrados, bloqueando el trabajo incremental.

**Por qué `outDir: ./server-dist`:**
El servidor en desarrollo y en producción con Electron usa los archivos `.js` directamente (Node.js no necesita compilación si usamos `tsx` o si los archivos `.js` son la fuente). `server-dist` existe por si en el futuro se quiere un build compilado separado, pero no es necesario para este plan.

---

## 0.4 — Agregar script en `package.json`

Agregar en la sección `"scripts"`:

```json
"verify:typecheck:server": "tsc --project tsconfig.server.json --noEmit"
```

---

## 0.5 — Configurar `tsconfig.server.json` para coexistencia

Agregar en el `tsconfig.server.json` la opción que permite que los archivos `.ts` vean los `.js` vecinos durante la coexistencia:

```json
"allowJs": true,
"checkJs": false
```

Esto permite que un archivo `.ts` nuevo haga `import { foo } from './cash.js'` y TypeScript resuelva correctamente tanto si `cash.js` existe (archivo JS antiguo) como si `cash.ts` ya fue migrado.

El `tsconfig.server.json` final queda:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./server-dist",
    "rootDir": "./server",
    "strict": true,
    "noUncheckedIndexedAccess": false,
    "exactOptionalPropertyTypes": false,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "allowJs": true,
    "checkJs": false
  },
  "include": ["server/**/*.ts", "server/**/*.js"],
  "exclude": ["server/__tests__/**", "node_modules", "server-dist"]
}
```

---

## 0.6 — Crear la carpeta de tipos base (vacía por ahora)

```bash
mkdir -p server/types
mkdir -p server/plugins
mkdir -p server/routes
```

Estos directorios estarán vacíos al final de Fase 0 — se van a poblar en Fases 1 y 2.

---

## 0.7 — Verificar baseline completo

```bash
# 1. TypeScript pasa con cero archivos .ts (esperado: "No inputs were found")
npm run verify:typecheck:server

# 2. Tests existentes siguen verdes
npm test

# 3. Lint limpio
npm run lint

# 4. Electron arranca (si xvfb disponible)
npm run electron:smoke
```

**Resultado esperado de `verify:typecheck:server`** cuando no hay archivos `.ts` aún:
TypeScript puede devolver un warning de "no inputs found" — esto es normal. El comando no debe devolver errores de tipos.

**Si `npm test` falla aquí:** revisar si alguna de las dependencias nuevas introdujo un conflicto. Verificar `npm ls fastify` para confirmar versión instalada.

---

## 0.8 — Commit de cierre de Fase 0

```bash
git add package.json package-lock.json tsconfig.server.json server/types/ server/plugins/ server/routes/
git commit -m "chore: add fastify + typescript toolchain for backend migration

- Install fastify, @fastify/cors, @fastify/helmet, @fastify/compress
- Install fastify-type-provider-zod
- Add tsconfig.server.json with NodeNext module resolution
- Add verify:typecheck:server script
- Create server/types/, server/plugins/, server/routes/ directories
- No functionality changed"
```

---

## Verificación de salida

Antes de marcar esta fase como completada en `PROGRESS.md`:

- [ ] `npm run verify:typecheck:server` — pasa (o "no inputs" sin errores)
- [ ] `npm test` — verde
- [ ] `npm run lint` — cero warnings
- [ ] `npm run electron:smoke` — Electron arranca
- [ ] Trivy no reporta vulnerabilidades críticas en las nuevas dependencias
- [ ] Commit realizado

---

## Siguiente paso

→ [Phase 1 — Domain Types](./phase-1-domain-types.md)

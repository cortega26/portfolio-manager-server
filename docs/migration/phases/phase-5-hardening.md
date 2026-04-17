# Fase 5 — Hardening TypeScript

**Objetivo:** Activar strict mode completo. Eliminar todos los `any`. Implementar tipos nominales para el dominio financiero. Validar salidas de API con schemas Zod. Auditoría de seguridad final.
**Duración estimada:** 2–3 horas
**Riesgo:** Bajo
**Prerequisito:** Fase 4 completada. Express eliminado. `npm test` verde con Fastify.

---

## 5.1 — Activar strict mode completo en `tsconfig.server.json`

Cambiar las opciones que estaban desactivadas en Fase 0:

```json
{
  "compilerOptions": {
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

Correr inmediatamente:

```bash
npm run verify:typecheck:server 2>&1 | head -50
```

Esto va a mostrar errores nuevos. Categorías comunes:

### Errores de `noUncheckedIndexedAccess`

```typescript
// Error: Object is possibly undefined
const price = prices[0]; // prices[0] es ahora `PricePoint | undefined`

// Fix: usar acceso seguro
const price = prices[0];
if (price === undefined) return null;

// O con nullish coalescing
const price = prices.at(0) ?? defaultPrice;
```

### Errores de `exactOptionalPropertyTypes`

```typescript
// Error: Type 'undefined' is not assignable to type 'string'
interface Foo {
  bar?: string; // con exactOptionalPropertyTypes, esto significa: bar ausente, no bar = undefined
}
const x: Foo = { bar: undefined }; // Error

// Fix: usar `bar?: string | undefined` explícitamente si se necesita asignar undefined
```

Resolver todos los errores antes de continuar. Si un error es complejo, agregar una nota en `PROGRESS.md`.

---

## 5.2 — Eliminar todos los `any` explícitos

```bash
grep -r "\bany\b" server/ --include="*.ts" | grep -v "node_modules"
```

Para cada `any` encontrado, reemplazar con el tipo preciso. Estrategias:

| Contexto del `any`             | Reemplazo                                  |
| ------------------------------ | ------------------------------------------ |
| `catch (e: any)`               | `catch (e: unknown)` + type guard          |
| `(obj as any).prop`            | Extender la interfaz con la propiedad      |
| Parámetros de funciones legacy | Definir tipos en `server/types/`           |
| Respuestas de APIs externas    | `unknown` + validación con `zod.safeParse` |

```typescript
// Patrón correcto para catch
try {
  // ...
} catch (e: unknown) {
  const message = e instanceof Error ? e.message : String(e);
  logger.error({ err: e }, message);
}
```

---

## 5.3 — Tipos nominales para el dominio financiero

Actualizar `server/types/domain.ts` para usar branded types:

```typescript
// Branded types — impiden mezclar accidentalmente Cents con MicroShares
declare const __cents: unique symbol;
declare const __microShares: unique symbol;

export type Cents = number & { readonly [__cents]: never };
export type MicroShares = number & { readonly [__microShares]: never };

// Constructores de cast — usar solo en los puntos de entrada del sistema
export function asCents(n: number): Cents {
  return n as Cents;
}
export function asMicroShares(n: number): MicroShares {
  return n as MicroShares;
}
```

Actualizar `server/finance/decimal.ts` para usar los branded types:

```typescript
export function toCents(value: number | string | Decimal): Cents {
  return Math.round(new Decimal(value).times(100).toNumber()) as Cents;
}

export function toMicroShares(value: number | string | Decimal): MicroShares {
  return Math.round(new Decimal(value).times(1_000_000).toNumber()) as MicroShares;
}
```

Con esto, TypeScript rechaza en compilación:

```typescript
const price: Cents = toCents(185);
const shares: MicroShares = toMicroShares(10);

// Error de tipo — no se pueden mezclar:
const wrong = price + shares; // Error: Cents + MicroShares no es válido
```

---

## 5.4 — Schemas de response Zod (validación de output)

Con `fastify-type-provider-zod`, los schemas de `response` en las rutas no solo documentan — **validan la respuesta en runtime**. Esto detecta en tests si un handler devuelve un campo extra, faltante o con tipo incorrecto.

Verificar que todas las rutas tienen `response` schema definido:

```bash
grep -r "schema:" server/routes/ --include="*.ts" -A 10 | grep -c "response:"
```

Para las rutas que aún no tienen `response` schema, agregar. Ejemplo en `portfolio.ts`:

```typescript
const PortfolioStateSchema = z.object({
  id: z.string(),
  transactions: z.array(TransactionSchema),
  cashRates: z.array(CashRateSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

app.get('/portfolio/:id', {
  preHandler: app.requireAuth,
  schema: {
    params: z.object({ id: portfolioIdSchema }),
    response: {
      200: PortfolioStateSchema,
      404: z.object({ error: z.string(), message: z.string() }),
    },
  },
  handler: async (request) => {
    // Si el handler devuelve algo que no cumple PortfolioStateSchema,
    // Fastify lanzará un error en runtime (detectable en tests)
  },
});
```

---

## 5.5 — Correr batería completa de tests con strict mode

```bash
npm run verify:typecheck:server   # Debe pasar con strict mode completo
npm test                          # Todos verdes
npm run lint
```

Si algún test falla por los branded types (por ejemplo, tests que comparan `number` directamente con `Cents`): actualizar las fixtures de test para usar los constructores `asCents()` y `asMicroShares()`.

---

## 5.6 — Auditoría de seguridad

### Trivy (vulnerabilidades en dependencias)

```bash
# Vía Codacy MCP tool: codacy_cli_analyze con tool=trivy
```

### Gitleaks (secretos en el repo)

```bash
npm run leaks:repo
```

### npm audit

```bash
npm audit --audit-level=moderate
```

Resolver cualquier vulnerabilidad de severidad `high` o `critical` antes de cerrar la fase.

---

## 5.7 — Verificación final de `electron/main.cjs`

```bash
git log --oneline electron/main.cjs
```

El archivo debe mostrar **cero commits nuevos** desde el inicio de la migración.

```bash
git diff HEAD~10 electron/main.cjs
# Debe mostrar vacío
```

---

## 5.8 — Limpiar artifacts de la migración

```bash
# Eliminar scripts temporales si se crearon
rm -f scripts/smoke-fastify.ts

# Eliminar server-dist si se generó accidentalmente
rm -rf server-dist/

# Asegurarse de que server-dist está en .gitignore
grep "server-dist" .gitignore || echo "server-dist/" >> .gitignore
```

---

## 5.9 — Commit de cierre de Fase 5

```bash
git add -A
git commit -m "refactor(types): strict ts hardening complete

- Enable noUncheckedIndexedAccess and exactOptionalPropertyTypes
- Replace all explicit 'any' with precise types
- Implement branded types: Cents, MicroShares (finance domain)
- Add Zod response schemas on all routes
- All 43 tests green with strict mode
- No security vulnerabilities (trivy clean)
- No leaked secrets (gitleaks clean)
- electron/main.cjs unchanged throughout migration"
```

---

## Verificación final del proyecto post-migración completa

```bash
# Suite completa
npm run verify:typecheck        # Frontend
npm run verify:typecheck:server # Backend
npm run lint                    # Cero warnings
npm test                        # 43 tests verdes
npm run electron:smoke          # Electron arranca
npm audit --audit-level=moderate # Sin vulnerabilidades
npm run leaks:repo              # Sin secretos
```

---

## Resumen de lo que cambió

| Antes                                      | Después                              |
| ------------------------------------------ | ------------------------------------ |
| Express 4 (JS puro)                        | Fastify 5 (TypeScript estricto)      |
| `middleware/*.js` (req/res/next)           | `plugins/*.ts` (Fastify hooks)       |
| Validación en middleware suelto            | Zod tipado end-to-end en rutas       |
| `any` en lógica financiera                 | Branded types `Cents`, `MicroShares` |
| Runtime errors de tipo en producción       | Errores de tipo en compilación       |
| Tests con `supertest`                      | Tests con `app.inject()`             |
| `express`, `cors`, `helmet`, `compression` | `@fastify/*` equivalentes            |
| Sin validación de response                 | Schemas Zod en inputs Y outputs      |

---

## Migración completa ✓

Actualizar `docs/migration/PROGRESS.md` — marcar todas las fases como completadas.

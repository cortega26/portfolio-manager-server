# Invariantes — Lo que nunca puede romperse

Leer este archivo antes de iniciar cualquier fase. Violar un invariante es un error crítico que requiere rollback inmediato.

---

## Invariantes de arquitectura

### INV-01: `electron/main.cjs` es intocable

**Qué:** El archivo `electron/main.cjs` no se modifica en ninguna fase de la migración.

**Por qué:** Es el orquestador del runtime desktop. Carga el servidor, genera el session token, registra los canales IPC, y abre la ventana. Cualquier cambio aquí tiene riesgo de romper el bootstrap de Electron.

**Cómo verificar:** `git diff HEAD~1 electron/main.cjs` debe mostrar vacío al final de cada fase.

---

### INV-02: La interfaz de `startServer()` no cambia

**Qué:** La función exportada desde `server/runtime/startServer.js` (o `.ts`) debe mantener el mismo contrato: `startServer()` sin argumentos, que inicia el servidor y devuelve (o resuelve) cuando está listo.

**Por qué:** `electron/main.cjs` importa y llama a `startServer()`. Si la firma cambia, Electron no arranca.

**Cómo verificar:** Después de Fase 4, buscar cómo `main.cjs` llama a `startServer()` y confirmar que la nueva versión es compatible.

---

### INV-03: El session token usa comparación timing-safe

**Qué:** La validación del token de sesión SIEMPRE usa `crypto.timingSafeEqual()`. No reemplazar con comparación directa (`===` o `==`).

**Por qué:** La comparación directa de strings es vulnerable a timing attacks. En un servidor local con Electron esto es de bajo riesgo, pero el patrón debe mantenerse por consistencia y defensa en profundidad.

**Dónde vive:** `server/plugins/sessionAuth.ts` en el plugin Fastify (equivalente al `sessionAuth.js` de Express).

**Cómo verificar:** `grep -r "timingSafeEqual" server/` debe encontrar exactamente una ocurrencia en el plugin de auth.

---

### INV-04: La lógica de dominio financiero no se reescribe

**Qué:** Los archivos `server/finance/decimal.js`, `cash.js`, `portfolio.js`, `returns.js` solo reciben **tipos** en la migración. La lógica interna (algoritmos, fórmulas, cálculos) no se toca.

**Por qué:** Estos módulos tienen tests de snapshots financieros (`returns.snapshot.test.js`). Cualquier cambio en la lógica produce fallos en snapshots que requieren revisión manual. El riesgo financiero es real: un cambio de comportamiento silencioso en `computeMoneyWeightedReturn` puede producir ROI incorrectos.

**Cómo verificar:** `git diff server/finance/*.js` en Fase 1 debe mostrar solo adición de tipos, nunca cambios en lógica.

---

### INV-05: El formato de respuesta de error no cambia

**Qué:** Todos los errores HTTP deben devolverse con este formato exacto:

```json
{
  "error": "ERROR_CODE",
  "message": "Human readable message",
  "details": [{ "path": ["field"], "message": "..." }]
}
```

El campo `details` es opcional (solo en errores de validación).

**Por qué:** El frontend React tiene código que parsea este formato. Un cambio aquí rompe el manejo de errores en la UI sin error visible en los tests del backend.

**Cómo verificar:** `grep -r '"error"' src/` para ver dónde el frontend consume errores y confirmar compatibilidad.

---

### INV-06: SQLite no se toca

**Qué:** `server/migrations/index.js` y el schema SQLite no se modifican en ninguna fase.

**Por qué:** Cualquier cambio en migraciones que afecte datos existentes de usuarios es un riesgo de corrupción. Las migraciones son unidireccionales — no hay rollback automático.

**Cómo verificar:** `git diff server/migrations/` al final de cada fase debe mostrar vacío.

---

### INV-07: Los schemas Zod son la única fuente de validación

**Qué:** No crear validación manual paralela (if/else sobre tipos de request) cuando ya existe un schema Zod para ese campo.

**Por qué:** Duplicar validación crea divergencias. Si el schema Zod permite `amount > 0` pero hay un if manual que permite `amount >= 0`, el comportamiento inconsistente es difícil de diagnosticar.

**Regla:** Si necesitas una validación nueva, agrégala al schema Zod en `server/routes/_schemas.ts`.

---

### INV-08: Los archivos `.js` de dominio no se eliminan hasta Fase 4

**Qué:** Durante las Fases 1, 2 y 3, los archivos `.js` originales coexisten con los nuevos `.ts`. No se eliminan prematuramente.

**Por qué:** Si se elimina un `.js` antes de que los tests estén migrados a los `.ts`, los tests fallan aunque la lógica sea correcta. La coexistencia es la garantía de rollback.

---

### INV-09: `npm test` verde es el gate de avance entre fases

**Qué:** Ninguna fase comienza si `npm test` falla.

**Por qué:** Si el baseline está roto, cualquier trabajo nuevo se construye sobre terreno inestable y los errores se vuelven imposibles de atribuir.

---

### INV-10: `shared/` es de solo lectura

**Qué:** El directorio `shared/` contiene contratos compartidos entre renderer y backend. No se modifica en esta migración.

**Por qué:** Los tipos y contratos en `shared/` son el contrato del API para el frontend. Cambiarlos requiere coordinación con el renderer React y está fuera del scope de esta migración.

---

## Checklist de invariantes por fase

Antes de hacer el commit de cierre de cada fase, verificar:

| Invariante | Comando de verificación                                       |
| ---------- | ------------------------------------------------------------- |
| INV-01     | `git diff HEAD~5 electron/main.cjs` → vacío                   |
| INV-02     | `grep -n "startServer" electron/main.cjs` → misma firma       |
| INV-03     | `grep -r "timingSafeEqual" server/` → exactamente 1 resultado |
| INV-04     | `git diff server/finance/*.js` → solo tipos, sin lógica       |
| INV-05     | Tests de `api_contract.test.js` pasan                         |
| INV-06     | `git diff server/migrations/` → vacío                         |
| INV-07     | No hay `if (typeof req.body.X === ...)` en rutas              |
| INV-08     | (Solo Fases 1-3) `ls server/finance/*.js` muestra archivos    |
| INV-09     | `npm test` verde                                              |
| INV-10     | `git diff shared/` → vacío                                    |

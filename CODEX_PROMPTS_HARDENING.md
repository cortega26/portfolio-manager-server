# CODEX_PROMPTS_HARDENING.md
**Context:** Apply the plan in `HARDENING.md` to make the app secure, correct, and resilient. **Do, don't just plan.** Use **Plan–Execute–Verify (PEV)**. If a task cannot be completed fully, split and create a follow‑up PR.

**Global Rules**
- Respect existing coding style.
- No secrets in code or logs.
- Add/modify code in small, reviewable commits.
- Keep functions readable (≤80 LOC soft), add docstrings/JSDoc, and unit tests for new code.
- All new endpoints must validate inputs and have explicit error codes.
- After each task: run tests, lint, audit; update the scoreboard.

---

## 0) Bootstrap: Create a HARDENING scoreboard (docs/HARDENING_SCOREBOARD.md)

**GOAL:** Create a living **scoreboard** to track each HARDENING item (ID, title, severity, status, branch, PR link, CI evidence).

**DO**
1. Create `docs/HARDENING_SCOREBOARD.md` using the template below.
2. (Optional) Also create machine‑readable `docs/hardening_scoreboard.json` with the same fields.
3. Add a `scripts/update-scoreboard.mjs` stub that, when run, can toggle statuses (to be completed later).

**TEMPLATE (paste and commit as is, then edit as you complete items):**
```md
# HARDENING Scoreboard

| ID      | Title                            | Severity | Owner | Status       | Branch            | PR | Evidence (CI) |
|---------|----------------------------------|----------|-------|--------------|-------------------|----|---------------|
| G1      | Coverage gate                    | HIGH     |       | TODO         |                   |    |               |
| G2      | Lint gate                        | MEDIUM   |       | TODO         |                   |    |               |
| G3      | Security audit gate              | MEDIUM   |       | TODO         |                   |    |               |
| G4      | Test artifacts                   | LOW      |       | TODO         |                   |    |               |
| G5      | Release gate                     | HIGH     |       | TODO         |                   |    |               |
| SEC-1   | Rate limiting                    | CRITICAL |       | TODO         |                   |    |               |
| SEC-2   | JSON size limits                 | HIGH     |       | TODO         |                   |    |               |
| SEC-3   | Per-portfolio API key            | HIGH*    |       | TODO         |                   |    |               |
| SEC-4   | Uniform error handler            | MEDIUM   |       | TODO         |                   |    |               |
| SEC-5   | HTTPS/HSTS                       | HIGH     |       | TODO         |                   |    |               |
| SEC-6   | Helmet + CSP                     | HIGH     |       | TODO         |                   |    |               |
| SEC-7   | Strict CORS                      | HIGH     |       | TODO         |                   |    |               |
| SEC-8   | CSV/Excel injection guard        | MEDIUM   |       | TODO         |                   |    |               |
| STO-1   | Atomic writes                    | CRITICAL |       | TODO         |                   |    |               |
| STO-2   | Per-portfolio mutex              | CRITICAL |       | TODO         |                   |    |               |
| STO-3   | Idempotent tx IDs                | HIGH     |       | TODO         |                   |    |               |
| STO-4   | Path hygiene                     | HIGH     |       | TODO         |                   |    |               |
| MTH-1   | Decimal math policy              | CRITICAL |       | TODO         |                   |    |               |
| MTH-2   | TWR/MWR & benchmark policy       | HIGH     |       | TODO         |                   |    |               |
| MTH-3   | Cash accruals doc & proration    | MEDIUM   |       | TODO         |                   |    |               |
| COM-1   | Request validation (zod)         | CRITICAL |       | TODO         |                   |    |               |
| COM-2   | Oversell reject + opt clip       | HIGH     |       | TODO         |                   |    |               |
| COM-3   | Same-day determinism rules       | MEDIUM   |       | TODO         |                   |    |               |
| COM-4   | Error codes & pagination         | MEDIUM   |       | TODO         |                   |    |               |
| PERF-1  | Price caching + stale guard      | HIGH     |       | TODO         |                   |    |               |
| PERF-2  | Incremental holdings             | MEDIUM   |       | TODO         |                   |    |               |
| PERF-3  | UI virtualization/pagination     | LOW      |       | TODO         |                   |    |               |
| PERF-4  | DB migration trigger             | LOW→MED  |       | TODO         |                   |    |               |
| TEST-1  | Unit tests                       | HIGH     |       | TODO         |                   |    |               |
| TEST-2  | Property-based tests             | HIGH     |       | TODO         |                   |    |               |
| TEST-3  | Golden snapshot tests            | HIGH     |       | TODO         |                   |    |               |
| TEST-4  | Concurrency tests                | HIGH     |       | TODO         |                   |    |               |
| TEST-5  | API contract tests               | HIGH     |       | TODO         |                   |    |               |

\* SEC-3 is HIGH if app is public-facing.
```
**ACCEPTANCE**
- The file exists with all IDs listed.
- Commits include the scoreboard and any script stubs.
- CI passes.

---

## PR‑1) Security Base (Helmet+CSP, CORS, rate limits, size limits, error handler, HTTPS note)

**GOAL:** Implement SEC‑1..2, SEC‑4..7 from HARDENING.md.

**DO**
1. Add `helmet` with minimal **CSP**; disable `x-powered-by`.
2. Strict **CORS allowlist** via `CORS_ALLOWED_ORIGINS` env.
3. **Rate limiting**: general + per‑portfolio routes (see snippets).
4. **JSON size limits**: `express.json({limit:'10mb'})`.
5. **Uniform error handler** middleware.
6. Add README section: “Deploy behind HTTPS + HSTS; no plaintext HTTP in prod.”

**VERIFY**
- `curl` shows proper security headers and `CORS` blocks unknown origins.
- Over‑limit bursts return `429`.
- Oversized JSON returns `413` or 400 with clear error.

**DELIVERABLES**
- Code changes under `server/`.
- Docs updated.
- Update scoreboard rows SEC‑1..2, 4..7 → DONE with PR link.

**ACCEPTANCE**
- All above plus CI green.

---

## PR‑2) Validation & Contracts (zod schemas, error codes, FE pre‑validation)

**GOAL:** Implement COM‑1 & COM‑4 (and align with FE).

**DO**
1. Create `server/middleware/validation.js` with `zod` schemas for requests (see snippet).
2. Apply middleware to write endpoints.
3. Standardize **error codes** (`VALIDATION_ERROR`, etc.).
4. Ensure pagination & error handling consistent.

**VERIFY**
- Malformed payloads return `400 VALIDATION_ERROR` with details array.
- Bad portfolio ID returns `400`.
- List endpoints paginate and carry ETags when applicable.

**DELIVERABLES**
- Middleware, tests, docs.
- Scoreboard COM‑1 & COM‑4 → DONE.

**ACCEPTANCE**
- Unit tests for validation pass; CI green.

---

## PR‑3) Storage Integrity (atomic writes, per‑portfolio mutex, path hygiene, idempotent tx IDs)

**GOAL:** Implement STO‑1..4.

**DO**
1. Add `utils/atomicStore.js` (tmp→fsync→rename).
2. Add `utils/locks.js` (per‑portfolio `withLock`).
3. Wire both into portfolio write paths.
4. Enforce ID pattern & path hygiene.
5. Add `tx.uid` on server if missing; dedupe on write.

**VERIFY**
- Parallel POSTs to same portfolio do not corrupt data.
- Killing the server during write leaves either old or new file—never corrupted partials.

**DELIVERABLES**
- New utils + wiring + tests.
- Scoreboard STO‑1..4 → DONE.

**ACCEPTANCE**
- Concurrency tests pass; CI green.

---

## PR‑4) Math & Precision (decimal.js; precision policy; rounding at boundaries)

**GOAL:** Implement MTH‑1 and prep for MTH‑2/3.

**DO**
1. Introduce `finance/decimal.js` and replace critical math with Decimal.
2. Adopt internal units (cents/micro‑shares) where feasible.
3. Round only at API boundaries (responses/exports).

**VERIFY**
- Long random sequences show no drift beyond ε.
- Save/load cycles are reversible.

**DELIVERABLES**
- Code changes + unit/property tests.
- Scoreboard MTH‑1 → DONE.

**ACCEPTANCE**
- Property tests pass; CI green.

---

## PR‑5) Caching & Freshness (dual providers, NodeCache+ETag, stale guard, trading‑day calendar)

**GOAL:** Implement PERF‑1 and parts of MTH‑2 (freshness) and add minimal calendar.

**DO**
1. Add cache layer (5–15 min TTL) + ETag on price/benchmark endpoints.
2. Implement **dual provider** fetcher with fallback.
3. Add **stale data** guard (N trading days).
4. Add minimal **isTradingDay** util (weekends + key holidays).

**VERIFY**
- Cold vs warm fetch shows cache hit.
- ETag returns `304` when unchanged.
- Stale data returns `503 STALE_DATA`.

**DELIVERABLES**
- Code + tests.
- Scoreboard PERF‑1 → DONE.

**ACCEPTANCE**
- Unit/integration tests; CI green.

---

## PR‑6) Tests & Gates (unit, property, golden, concurrency; coverage & audit gates)

**GOAL:** Implement TEST‑1..5 and G1..G5.

**DO**
1. Add unit tests (transactions, accruals, TWR/MWR, blending, CSV guard, stale guard).
2. Add property‑based tests (fast‑check): ledger invariants.
3. Add **golden snapshot** tests for ROI/benchmark series.
4. Add concurrency tests for mutex/atomic writes.
5. Wire **CI** coverage gate, audit step, and artifact uploads.

**VERIFY**
- `node --test --experimental-test-coverage` produces coverage report ≥85%.
- `npx nyc check-coverage` passes.
- All tests green in CI.

**DELIVERABLES**
- Tests, CI config, docs.
- Scoreboard TEST‑* and G* → DONE.

**ACCEPTANCE**
- CI green with coverage ≥85%.

---

## (Ongoing) Business Rules & UX

**Oversell policy (COM‑2):** Default reject (`E_OVERSELL`); add **opt‑in** auto‑clip + UI confirm + audit trail.  
**Same‑day determinism (COM‑3):** Order `DEPOSIT→BUY→SELL→WITHDRAWAL`; tie‑break `createdAt`, then monotonic `seq`.  
**Cash accruals (MTH‑3):** Document day‑count convention; proration on rate change timestamps.  
**Docs:** Add `docs/returns.md`, `docs/benchmarks.md`, `docs/errors.md`.

**VERIFY**
- Manual tests + unit tests reflect rules.
- Documentation added.
- Scoreboard COM‑2..3, MTH‑3 → DONE when shipped.

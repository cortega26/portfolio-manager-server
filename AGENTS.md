
<!-- markdownlint-disable -->
# AGENTS.md — Portfolio Manager (Server Edition)

**Repository:** `cortega26/portfolio-manager-server`  
**Stack:** React + Vite + Tailwind (frontend), Node/Express (backend), file‑based persistence.  
**Price source:** Stooq (adjusted daily data; no API key).  
**Why this doc?** To orchestrate AI tasks (Codex) so it **edits code**, adds tests, and ships features — not just write reports.

---

## 0) Context from the repo (source of truth)
- Backend/API is an **Express** server with REST endpoints for prices and portfolio CRUD. Development flow runs `npm run server` for backend and `npm run dev` for Vite, per README.  
- Portfolios persist to the `data/` directory; portfolio IDs are validated with the regex `[A-Za-z0-9_-]{1,64}` to prevent path traversal.  
- Prices are fetched from **Stooq** (US tickers), and the UI benchmarks ROI vs **SPY** using daily price data.  
- The repo already contains the file **`cash-and-benchmarks-action-plan.md`** with deliverables for cash & benchmarks.

> These behaviors must be preserved while adding the cash & benchmark feature, improving quality and security.

---

## 1) MODE & RULES

### MODE
- **PEV (Plan → Execute → Verify)** on every task.
- Use the Codex tier that satisfies acceptance criteria; **auto‑fallback** if blocked and record the fallback in a compliance note within the PR description.

### RULES
**R1 — Code Quality**
- Respect existing toolchain; add ESLint + Prettier if missing. Keep functions focused (soft limit ≤80 LOC; cyclomatic complexity ≤10).

**R2 — Security**
- Validate inputs on all endpoints (IDs already validated; extend to query params). No `shell=True` equivalents, no unsafe `child_process`. Mask secrets in logs.

**R3 — API Contracts**
- Document all routes in OpenAPI (YAML or JSON). Version `/api` responses; don’t break clients.

**R4 — Tests & Coverage**
- Add unit tests (Jest or Vitest) and API tests (supertest). Target ≥85% coverage for **new** modules; snapshot tests allowed for API JSON.

**R5 — Observability**
- Use structured logging (e.g., `pino`). Include request ID, timing, and upstream fetch latency to Stooq.

**R6 — DX**
- `npm test`, `npm run dev`, `npm run server` keep working. Add `npm run lint`, `npm run typecheck` (if adding TS), and `npm run backfill` if implemented.

---

## 2) Roles (AI Agents)

### A. Orchestrator
- Reads this AGENTS.md; creates/updates issues and PRs per phase. Ensures PEV and acceptance criteria are met.

### B. Backend Engineer — Cash & Returns
- Implement **cash as a position** (ticker `CASH`, price=1.0) with **daily interest accrual** via `INTEREST` internal transactions.
- Build **TWR** calculators for: Portfolio (incl. cash), Ex‑cash sleeve, and **All‑SPY** ghost portfolio (using external flows).

### C. Data Provider — Prices
- Provide an adapter interface for price sources; default **Stooq**. Ensure **adjusted** values are used when available. Cache responses; respect timeout.

### D. Benchmarks Analyst
- Implement **blended benchmark** using daily weights w.r.t cash vs SPY. Produce Cash Drag metrics.

### E. API Engineer
- Add routes to serve returns, NAV snapshots, benchmarks, and set/get cash APY timeline. Validate inputs.

### F. Frontend Integrator
- Wire new series (Portfolio, Ex‑cash, All‑SPY, Blended) to charts (Recharts). Add toggle for **Blended vs 100% SPY** comparison and small KPI panel.

### G. QA Engineer
- Add golden tests and idempotency tests for interest accrual. Add backfill tests and API schema tests. Enforce coverage target.

### H. SecOps
- Add dependency audit, basic SAST (ESLint security rules), and HTTP hardening (helmet, CORS config).

---

## 3) Deliverables (feature + platform)

### Core Feature
- `INTEREST` transaction type (internal).
- Daily interest accrual from an APY timeline (admin‑editable); accrues on prior day’s closing balance.
- TWR series: Portfolio incl‑cash, Ex‑cash sleeve, All‑SPY ghost.
- Benchmarks: Blended (cash+SPY by actual weights) and 100% SPY.
- New endpoints:
  - `GET /api/returns/daily?from=YYYY-MM-DD&to=YYYY-MM-DD&views=port,excash,spy,bench`  
  - `GET /api/nav/daily?from=...&to=...`  
  - `GET /api/benchmarks/summary?from=...&to=...`  
  - `POST /api/admin/cash-rate` (upsert `{effective_date, apy}`) — protected.
- Docs: `docs/cash-benchmarks.md`, OpenAPI updated.

### Platform Upgrades
- Logging: `pino` middleware; latency metrics.
- Validation: `zod`/`valibot` (or express‑validator) schemas for route inputs.
- Tests: Jest/Vitest + supertest; coverage report.
- CI: GitHub Actions runs lint, test, build, and a light e2e (API ping).

---

## 4) Storage Model (file-based, no DB migration required)

- Keep **file‑based** persistence under `data/`:
  - `portfolio_<id>.json` — existing.
  - `rates_<id>.json` or `cash_rates.json` — APY timeline.
  - `nav_<id>.jsonl` — daily NAV snapshots (JSON lines, append‑only).
  - `returns_<id>.jsonl` — daily returns and benchmark steps.
- Provide a `backfill` script to recompute snapshots/returns from transactions for reproducibility.

---

## 5) Acceptance Criteria (binary)

- **A1**: Daily `INTEREST` entries posted for days with APY>0 and non‑zero cash; re‑runs are idempotent (no duplicates).
- **A2**: `GET /api/returns/daily` returns 4 series (`r_port`, `r_ex_cash`, `r_spy_100`, `r_bench_blended`) for date ranges; inputs validated.
- **A3**: Synthetic 50% cash test shows `R_port ≈ 0.5*R_SPY + 0.5*R_cash` within 1 bp over 1y.
- **A4**: All‑SPY track equals the TWR of a portfolio that buys SPY with the same dated external flows (property test).
- **A5**: Coverage ≥85% on new code; CI green.
- **A6**: Price provider uses adjusted values; provider unit tests pass.
- **A7**: API schemas documented; clients unaffected; legacy endpoints still behave as in README.
- **A8**: Stooq request timeouts respected; failures degrade gracefully.

---

## 6) Phases & Checklists

### Phase 0 — Wire‑up
- Detect package manager and scripts; keep `npm run dev` and `npm run server` behavior.
- Feature flag `features.cash_benchmarks=true` in config.

### Phase 1 — Models & Types
- Add `INTEREST` type; extend validators.
- Add cash APY timeline store. Create accrual utilities (`cash/dailyRate`, `cash/accrue`).

### Phase 2 — Returns & Benchmarks
- Implement TWR calculators and ghost SPY. Handle external vs internal flows.

### Phase 3 — Endpoints
- Implement GET/POST routes with validation and OpenAPI.

### Phase 4 — Frontend
- Add line series and toggles; adjust KPI panel.

### Phase 5 — Tests & CI
- Unit + API tests, coverage gate, CI workflow.

### Phase 6 — Docs
- Write `docs/cash-benchmarks.md`, update README and OpenAPI.

---

## 7) Guardrails (Do/Don’t)

- **Do** modify files directly, create migrations/scripts/tests, and open PRs.
- **Do** preserve ID validation and file persistence semantics.
- **Don’t** switch storage engine without explicit instruction.
- **Don’t** introduce breaking API changes.
- **Don’t** aggregate monthly interest into one day if computing daily TWR.

---

## 8) Commands (developer ergonomics)
- `npm run server` — start Express API
- `npm run dev` — Vite dev (proxy to `/api`)
- Suggested additions:
  - `npm run lint`
  - `npm run test`
  - `npm run backfill -- --from=YYYY-MM-DD --to=YYYY-MM-DD`

---

## 9) How to prompt Codex (short form)

> **Implement Cash & Benchmarks (edit files; ship code)**
> - Follow AGENTS.md. Modify code, write tests, update docs. Keep existing dev scripts intact.
> - Add daily interest accrual (`INTEREST`), TWR series, ghost SPY, blended benchmark, endpoints and UI toggle.
> - Use adjusted price data via provider interface (Stooq default, cached).
> - Add logging, input validation, tests (≥85% new code), and CI gates.
> - If blocked, split minimally and deliver behind a feature flag; leave TODOs in `docs/cash-benchmarks.md#todo`.

---

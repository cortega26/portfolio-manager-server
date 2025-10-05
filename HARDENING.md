# Portfolio Manager — HARDENING.md (Security, Integrity & Reliability Plan)

> Purpose: turn the app into a **boringly robust** system. This re‑audits the uploaded report, tightens weak spots,
> adds missing controls (atomicity, precision), and supplies ready‑to‑merge patches, quality gates, and tests.

---

## Executive Summary

**What changes now (high‑impact, low‑regret):**  
- **Security:** strict CORS allowlist, Helmet with CSP, request **rate limits** + **size limits**, **per‑portfolio API key** (hashed), uniform error handler, **HTTPS/HSTS** guidance.  
- **Storage integrity:** **atomic writes** (tmp → fsync → rename) and **per‑portfolio mutex** to prevent race‑corruption; sanitize IDs and paths.  
- **Precision:** adopt **decimal.js** (or integer cents/micro‑shares) with a precision policy; round only at boundaries.  
- **Behavioral safety:** **reject oversells by default** (400), optional **auto‑clip** behind a setting + server‑side audit trail. Deterministic same‑day ordering with tie‑breakers (`createdAt`, monotonic `seq`).  
- **Data freshness:** dual price providers with cache + ETag, **stale‑price guard**, minimal **trading‑day calendar** (weekends + major holidays) to avoid TWR artifacts.  
- **Quality gates:** measured coverage (≥ **85%** global, ≥ **90%** changed modules), lint and audit on CI, artifacts uploaded.  
- **Confidence:** property‑based tests for ledger invariants, **golden snapshot** tests for ROI/benchmark series, concurrency tests for storage.

**Scope difference vs original audit:**  
The prior audit was directionally right on validation, rate limiting, caching, pagination, and complexity. This plan **upgrades auth severity** (public = HIGH), adds **atomicity & locking**, **precision policy**, **CSV injection** defenses, and makes **oversell reject‑first** with an opt‑in clip.

---

## Table of Contents

1. [Quality Gates (CI/CD)](#quality-gates-cicd)  
2. [Security Hardening (SEC‑*)](#security-hardening-sec-)  
3. [Storage & Concurrency (STO‑*)](#storage--concurrency-sto-)  
4. [Precision & Accounting (MTH‑*)](#precision--accounting-mth-)  
5. [API Contracts & Business Rules (COM‑*)](#api-contracts--business-rules-com-)  
6. [Performance & Scalability (PERF‑*)](#performance--scalability-perf-)  
7. [Testing & Confidence (TEST‑*)](#testing--confidence-test-)  
8. [Incremental PR Plan](#incremental-pr-plan)  
9. [Appendices (snippets & commands)](#appendices-snippets--commands)

---

## Quality Gates (CI/CD)

- **G1 — Coverage gate:** compute **measured** coverage on CI, fail if `<85%` global or `<90%` on changed modules. Upload `coverage-summary.json` as artifact.  
- **G2 — Lint gate:** ruff/eslint + prettier/black as applicable. Fail on style or type errors.  
- **G3 — Security/audit gate:** `npm audit --audit-level=moderate` (or equivalent) and secret scan.  
- **G4 — Test artifacts:** store Jest/Node test reports, coverage, and logs for each run.  
- **G5 — Release gate:** require all checks green before deploy.

**CI Sketch** (`.github/workflows/ci.yml` excerpt):
```yaml
name: ci
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - name: Lint
        run: npm run lint
      - name: Test with coverage
        run: node --test --experimental-test-coverage
      - name: Upload coverage
        uses: actions/upload-artifact@v4
        with: { name: coverage, path: coverage }
      - name: Enforce coverage
        run: npx nyc check-coverage --branches=85 --functions=85 --lines=85 --statements=85 || exit 1
      - name: Audit
        run: npm audit --audit-level=moderate
```

---

## Security Hardening (SEC‑*)

### SEC‑1: Missing Rate Limiting (**CRITICAL**)
**Risk:** brute‑force & scraping of expensive endpoints.  
**Fix:** per‑route and per‑portfolio limiters.
```js
import rateLimit from 'express-rate-limit';
const generalLimiter  = rateLimit({ windowMs: 60_000, max: 100 });
const portfolioLimiter= rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true });
app.use('/api', generalLimiter);
app.use('/api/portfolio', portfolioLimiter);
app.use('/api/returns', portfolioLimiter);
app.use('/api/nav', portfolioLimiter);
```

### SEC‑2: No Request Size Limits (**HIGH**)
**Risk:** payload‑amplified DoS.  
**Fix:**
```js
app.use(express.json({ limit: '10mb' }));
```

### SEC‑3: Authentication & Authorization (Severity depends on deployment → **HIGH** if public)
**Risk:** unauthorized read/write of portfolios.  
**Fix (lightweight, now):** per‑portfolio API key (**hash stored**; no plaintext), provided via `x-portfolio-key` header.
```js
// middleware/auth.js
import crypto from 'node:crypto';
const sha256 = (s) => crypto.createHash('sha256').update(s).digest();
export function verifyPortfolioKey(req,res,next){
  const key = req.get('x-portfolio-key');
  if(!key) return res.status(401).json({ error:'NO_KEY' });
  const storedHashHex = getHashFor(req.params.id); // implement lookup
  const ok = crypto.timingSafeEqual(Buffer.from(storedHashHex,'hex'), sha256(key));
  if(!ok) return res.status(403).json({ error:'BAD_KEY' });
  next();
}
```
> **Later:** move to user auth (JWT/OIDC) only when multi‑user truly needed.

### SEC‑4: Error Information Leakage (**MEDIUM**)
**Risk:** stack traces disclose internals.  
**Fix:** uniform error handler.
```js
// middleware/errors.js
export function errors(err, req, res, _next) {
  const status = err.status || 500;
  const code = err.code || 'INTERNAL_ERROR';
  if (status >= 500) req.log?.error?.({ err, code }, 'server error');
  res.status(status).json({ error: code, message: status < 500 ? err.message : 'Unexpected server error' });
}
app.use(errors);
```

### SEC‑5: HTTPS & HSTS (**MEDIUM → HIGH** in production)
**Fix:** only serve behind HTTPS; enable HSTS at proxy or via Helmet (see next).

### SEC‑6: Security Headers + CSP (**HIGH**)
**Risk:** clickjacking, sniffing, XSS.  
**Fix:** use Helmet with minimal CSP. Replace inline scripts with hashed/nonce’d where needed.
```js
import helmet from 'helmet';
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: { "script-src": ["'self'"] } // upgrade with nonces if needed
  },
  frameguard: { action: 'deny' },
  hsts: { maxAge: 15552000, includeSubDomains: true, preload: true },
}));
app.disable('x-powered-by');
```

### SEC‑7: Strict CORS (**HIGH**)
```js
import cors from 'cors';
const ALLOW = process.env.CORS_ALLOWED_ORIGINS?.split(',') ?? [];
app.use(cors({
  origin: (origin, cb) => (origin && ALLOW.includes(origin)) ? cb(null, true) : cb(new Error('CORS')),
  methods: ['GET','POST','PUT','DELETE'],
  credentials: false,
}));
```

### SEC‑8: CSV/Excel Injection (**MEDIUM**)
**Risk:** cells beginning with `= + - @` execute as formulas.  
**Fix:**
```js
export const csvCell = (v) => /^[=+\-@]/.test(String(v)) ? `'${v}` : String(v);
```

---

## Storage & Concurrency (STO‑*)

### STO‑1: Atomic Writes (**CRITICAL**)
**Risk:** partial writes corrupt state (crash mid‑write).  
**Fix:** write to `*.tmp`, **fsync**, then **rename** (atomic on POSIX).
```js
// utils/atomicStore.js
import { writeFile, rename, open } from 'node:fs/promises';
import path from 'node:path';
export async function atomicWrite(dir, id, obj){
  const tmp = path.join(dir, `${id}.${Date.now()}.tmp`);
  const fin = path.join(dir, `${id}.json`);
  await writeFile(tmp, JSON.stringify(obj), 'utf8');
  const fh = await open(tmp,'r'); await fh.sync(); await fh.close();
  await rename(tmp, fin);
}
```

### STO‑2: Per‑Portfolio Mutex (**CRITICAL**)
**Risk:** concurrent POSTs interleave → lost updates.  
**Fix:**
```js
// utils/locks.js
const locks = new Map();
export async function withLock(key, fn){
  while (locks.get(key)) await locks.get(key);
  let result; const p = (async()=>{ result = await fn(); })();
  locks.set(key, p);
  try { await p; } finally { locks.delete(key); }
  return result;
}
```
Usage:
```js
app.post('/api/portfolio/:id', verifyPortfolioKey, async (req,res,next)=>{
  const id = req.params.id;
  await withLock(id, async ()=>{
    const state = await loadPortfolio(id);
    const nextState = mergeState(state, req.body);
    await atomicWrite(DATA_DIR, id, nextState);
  });
  res.json({ ok:true });
});
```

### STO‑3: Idempotent Transaction IDs (**HIGH**)
**Fix:** require a client‑generated `tx.uid` or add one server‑side; dedupe on write.

### STO‑4: Path Hygiene (**HIGH**)
- Keep `ID` pattern `[A-Za-z0-9_-]{1,64}`.  
- Build paths with `path.join(DATA_DIR, id)`, reject `..`, `%2e%2e`, NUL.

---

## Precision & Accounting (MTH‑*)

### MTH‑1: Deterministic Math Policy (**CRITICAL**)
**Risk:** floating‑point drift over long ledgers.  
**Fix:** use **decimal.js** (or integers). Round only at I/O boundaries.
```js
// finance/decimal.js
import Decimal from 'decimal.js';
export const d = (x) => new Decimal(x);
export const toCents = (x) => d(x).times(100).toDecimalPlaces(0).toNumber();
export const fromCents = (c) => d(c).div(100);
```

### MTH‑2: Returns & Benchmarks (**HIGH**)
- **TWR** day‑1 handling (no divide‑by‑zero), documented formula.  
- **Benchmark weights** frozen at **start‑of‑period** and at each **rebalancing cadence** (e.g., monthly). Provide “static at inception” and “monthly rebalanced” variants.  
- **MWR (XIRR)** offered alongside TWR for user clarity.

### MTH‑3: Cash Accruals (**MEDIUM**)
- Document **day‑count convention** (Actual/365, etc.).  
- Rate changes are **effective from timestamp**, prorated over day boundary.

---

## API Contracts & Business Rules (COM‑*)

### COM‑1: Request Validation (**CRITICAL**)
**Fix:** runtime schema validation on **every** body.
```js
// middleware/validation.js
import { z } from 'zod';
export const Tx = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ticker: z.string().min(1).max(10),
  type: z.enum(['BUY','SELL','DIVIDEND','DEPOSIT','WITHDRAWAL']),
  amount: z.number().finite(),
  price: z.number().positive().finite(),
  shares: z.number().nonnegative().finite(),
  fee: z.number().nonnegative().finite().optional(),
});
export const Portfolio = z.object({
  transactions: z.array(Tx).max(250_000),
  settings: z.object({ autoClip: z.boolean().default(false) }).default({ autoClip:false }),
});
export const validatePortfolio = (req,res,next)=>{
  const p = Portfolio.safeParse(req.body);
  if(!p.success) return res.status(400).json({ error:'VALIDATION_ERROR', details: p.error.issues });
  req.body = p.data; next();
};
```

### COM‑2: Oversell Handling (**HIGH**)
- **Default:** **reject** with `400 E_OVERSELL` (`"Trying to sell X > available Y"`).  
- **Optional:** if `settings.autoClip === true`, clip to available and append a `system_note` to the transaction log (audit trail).  
- **UI:** confirmation modal when clipping would occur.

### COM‑3: Same‑Day Determinism (**MEDIUM**)
- Process order: **DEPOSIT → BUY → SELL → WITHDRAWAL**.  
- Tie‑breakers: `createdAt` (UTC ms), then a monotonic `seq`.  
- Document rules in help and changelog.

### COM‑4: Error Codes & Pagination (**MEDIUM**)
- Uniform error codes (`E_PRICE_NEGATIVE`, `E_OVERSELL`, …).  
- Paginate history beyond **2k** rows; include `ETag` and caching for price/benchmark endpoints.

---

## Performance & Scalability (PERF‑*)

### PERF‑1: Price & Benchmark Caching (**HIGH**)
**Fix:** dual providers + cache + ETag; reject **stale** quotes (older than N trading days).
```js
import NodeCache from 'node-cache'; const cache = new NodeCache({ stdTTL: 300 });
app.get('/api/prices/:symbol', async (req,res)=>{
  const key = `prices:${req.params.symbol}:${req.query.range||'1y'}`;
  let data = cache.get(key);
  if(!data){ data = await fetchHistoricalPrices(req.params.symbol, req.query.range); cache.set(key, data); }
  const etag = createEtag(data);
  if (req.headers['if-none-match'] === etag) return res.status(304).end();
  res.set('Cache-Control','public, max-age=300'); res.set('ETag', etag);
  if (isStale(data)) return res.status(503).json({ error:'STALE_DATA' });
  res.json(data);
});
```

### PERF‑2: Incremental Holdings (**MEDIUM**)
- Maintain running positions; avoid repeated O(n²) recomputes.  
- Rebuild only on back‑dated edits or schema migrations.

### PERF‑3: UI Virtualization & Pagination (**LOW**)
- Virtualize lists beyond **5k** rows; paginate beyond **2k**.

### PERF‑4: Database Migration Trigger (**LOW → MEDIUM**)
- Consider DB when: portfolios **>50k tx**, active users **>100**, or cross‑portfolio queries are needed.

---

## Testing & Confidence (TEST‑*)

### TEST‑1: Unit Tests
- Transaction math, cash accruals, TWR/MWR, blending logic, CSV sanitization, stale guards.

### TEST‑2: Property‑Based Tests (fast‑check)
- Random sequences of operations with invariants:  
  - No negative shares.  
  - NAV continuity (no price change → returns reflect only flows).  
  - Cash conservation: deposits−withdrawals−fees match delta in cash.  
  - Reversibility on save/load.

### TEST‑3: Golden Snapshot Tests
- Freeze ROI & blended benchmark series for a known seed (e.g., SPY + AAPL 2023‑01‑01→2023‑12‑31) and compare byte‑for‑byte to detect regressions.

### TEST‑4: Concurrency Tests
- Parallel POSTs on same portfolio must not corrupt (mutex + atomic write).

### TEST‑5: API Contract Tests
- Malformed payloads → `400 VALIDATION_ERROR`; oversell → `400 E_OVERSELL` (unless `autoClip`), rate‑limit → `429`.

---

## Incremental PR Plan

**PR‑1 — Security Base**: Helmet (+ CSP), strict CORS, rate limits, size limits, error handler, HTTPS note.  
**PR‑2 — Validation & Contracts**: zod schemas, error codes, FE pre‑validation.  
**PR‑3 — Storage Integrity**: per‑portfolio mutex + atomic writes; path hygiene; idempotent `tx.uid`.  
**PR‑4 — Math & Precision**: decimal.js integration; precision policy; rounding at API boundaries.  
**PR‑5 — Caching & Freshness**: dual provider fetcher, NodeCache + ETag, stale‑guard, minimal trading‑day calendar.  
**PR‑6 — Tests & Gates**: property‑based + golden snapshot tests; coverage gate; audit job.

Each PR is small and independently shippable. Merge order as listed.

---

## Appendices (snippets & commands)

### A. Middleware Wiring
```js
// server/app.js
app.use(express.json({ limit: '10mb' }));
app.use(helmet(/* CSP as above */));
app.use(cors(/* allowlist */));
app.use(generalLimiter);

app.post('/api/portfolio/:id',
  verifyPortfolioKey,
  validatePortfolio,
  portfolioLimiter,
  async (req,res,next)=>{ /* withLock + atomicWrite */ }
);
app.use(errors); // last
```

### B. Minimal Trading‑Day Calendar (weekends + selected holidays)
```js
export function isTradingDay(d){
  const dt = new Date(d), wd = dt.getUTCDay();
  if (wd === 0 || wd === 6) return false; // Sun, Sat
  const y = dt.getUTCFullYear();
  const holidays = new Set([`${y}-01-01`, `${y}-07-04`, `${y}-12-25`]); // extend for your markets
  const iso = dt.toISOString().slice(0,10);
  return !holidays.has(iso);
}
```

### C. CLI Hints
```bash
# Lint
npm run lint

# Run tests with coverage
node --test --experimental-test-coverage

# Check coverage threshold (nyc)
npx nyc check-coverage --branches=85 --functions=85 --lines=85 --statements=85

# Security audit
npm audit --audit-level=moderate
```

### D. Error Codes (starter list)
- `VALIDATION_ERROR` — zod schema failed (details array).  
- `E_OVERSELL` — attempted sell exceeds available shares.  
- `STALE_DATA` — data older than guard threshold.  
- `NO_KEY` / `BAD_KEY` — missing/invalid portfolio key.  
- `RATE_LIMITED` — `429` from limiter (auto).  
- `INTERNAL_ERROR` — generic 500.

---

## Summary & Next Steps

- Ship **PR‑1..PR‑6** in order; each provides compounding risk reduction.  
- Turn on the **coverage gate** and dual‑provider **stale guard** early to catch regressions and data issues.  
- Move “oversell: clip vs reject” behind a setting and set **reject** as default.  
- Document return methodology, ordering rules, day‑count, rebalancing cadence, and error codes in `docs/`.

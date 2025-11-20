# Portfolio Manager Server — Professionalization Hotspots (2025-02-14)

This note captures the five production-readiness gaps identified during the repo sweep. Each
item is referenced in the main report and is intended to seed discrete hardening PRs.

1. **Response cache lacks any invalidation hooks** – `server/app.js` instantiates a single
   `NodeCache` and populates it for portfolio/nav/returns endpoints, but there is no
   corresponding `del`/`flush` when a portfolio is mutated. Writes therefore leave stale
   analytics visible for the default 10-minute TTL (`DEFAULT_API_CACHE_TTL_SECONDS`).
2. **API keys hashed with unsalted SHA-256** *(✅ Resolved 2025-11-04)* – `digestPortfolioKey` /
   `hashPortfolioKey` now generate per-key salts before hashing, legacy hashes upgrade the first
   time a client authenticates, and a regression suite (`server/__tests__/portfolio_keys.test.js`)
   covers bootstrap, upgrade, and rotation flows. Evidence: `server/app.js`.
3. **Client stores raw API keys in `localStorage`** *(✅ Resolved 2025-11-11)* – The new volatile
   key vault keeps credentials in-memory only (`src/utils/portfolioKeys.js`), and a dedicated
   Vitest suite (`src/utils/__tests__/portfolioKeys.test.js`) asserts that no browser storage APIs
   are touched. Users now re-enter keys on reload, preventing long-lived copies in `localStorage`.
4. **HTTP logs expose credential headers** *(✅ Resolved 2025-11-11)* – HTTP logging now applies
   Pino redaction to `X-Portfolio-Key`/`X-Portfolio-Key-New` headers and a regression test
   (`server/__tests__/http_logging_redaction.test.js`) proves the redaction is enforced.
   Evidence: `server/app.js`.
5. **`server/app.js` is a 50 kB one-liner** *(✅ Resolved 2025-11-12)* – Common plumbing now lives in
   dedicated modules (`server/logging/httpLogger.js`, `server/middleware/requestContext.js`), so the
   main bootstrap focuses on business logic and tests can import the helpers directly.

See the accompanying report for remediation plans, owners, and acceptance criteria.

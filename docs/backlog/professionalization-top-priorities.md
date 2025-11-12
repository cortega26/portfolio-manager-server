# Portfolio Manager Server — Professionalization Hotspots (2025-02-14)

This note captures the five production-readiness gaps identified during the repo sweep. Each
item is referenced in the main report and is intended to seed discrete hardening PRs.

1. **Response cache lacks any invalidation hooks** – `server/app.js` instantiates a single
   `NodeCache` and populates it for portfolio/nav/returns endpoints, but there is no
   corresponding `del`/`flush` when a portfolio is mutated. Writes therefore leave stale
   analytics visible for the default 10-minute TTL (`DEFAULT_API_CACHE_TTL_SECONDS`).
2. **API keys hashed with unsalted SHA-256** – `digestPortfolioKey` / `hashPortfolioKey` in
   `server/app.js` call `createHash('sha256')` directly. Without per-key salts or a KDF, the
   stored hashes in `data/portfolio_keys.json` are vulnerable to rainbow tables.
3. **Client stores raw API keys in `localStorage`** – `src/utils/portfolioKeys.js` persists keys
   verbatim under `portfolio-manager-portfolio-keys`, so any XSS or shared-browser use leaks
   portfolio credentials.
4. **HTTP logs expose credential headers** – The `pinoHttp` setup in `server/app.js` does not
   enable `redact`, so `X-Portfolio-Key` and `X-Portfolio-Key-New` will be serialized in request
   logs by default.
5. **`server/app.js` is a 50 kB one-liner** – The entire Express surface is bundled onto line 1,
   making diffs and code review effectively impossible. Breaking the file back into logical
   modules restores readability and testability.

See the accompanying report for remediation plans, owners, and acceptance criteria.

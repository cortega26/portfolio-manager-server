# Frontend ↔ Backend Contract Audit

_Last updated: 2025-02-14_

## Route / Feature Matrix

| UI Flow | HTTP Method & Path | Request Schema | Response Schema | Status Codes | Error Mapping | Automated Tests |
| --- | --- | --- | --- | --- | --- | --- |
| Dashboard load (ROI chart + KPIs) | `GET /api/v1/returns/daily?from=&to=&views=` | Query params: `from?` (`YYYY-MM-DD`), `to?` (`YYYY-MM-DD`), `views` (comma string limited to `port`, `excash`, `spy`, `bench`, `cash`) | JSON `{ series: { r_port: DateValueSeries, ... }, meta: Pagination }` | `200`, `400` (validation), `401` (portfolio auth), `429`, `500+` | 4xx shows inline banner; 5xx surfaces toast + request ID | `src/__tests__/App.test.jsx`, `server/__tests__/api_contract.test.js` |
| Dashboard NAV widget / Admin refresh | `GET /api/v1/nav/daily?from=&to=&page=&per_page=` | Query params: optional dates, pagination ints (1–500) | JSON `{ data: [{ date, portfolio_nav, ... }], meta: Pagination }` | `200`, `400`, `401`, `429`, `500+` | Table empty state with alert on 4xx; toast on 5xx | `src/__tests__/AdminTab.test.jsx`, `server/__tests__/nav_endpoint.test.js` |
| Price series fetch (ROI backfill) | `GET /api/v1/prices/:symbol?range=` | Path `symbol` (URI encoded), query `range` defaults `1y` | JSON `{ data: PricePoint[], meta? }` | `200`, `400`, `404`, `429`, `500+` | 404 → inline alert; other 4xx/5xx toast with request ID | `src/__tests__/App.pricing.test.jsx`, `server/__tests__/prices_endpoint.test.js` |
| Persist portfolio | `POST /api/v1/portfolio/:portfolioId` | JSON body validated by `shared/portfolioSchema`, headers: `X-Portfolio-Key`, optional `X-Portfolio-Key-New` | JSON `{ data?: PortfolioState }` (empty `{}` accepted) | `200`, `201`, `400 WEAK_KEY`, `401`, `409`, `422`, `429`, `500+` | Validation errors render field level hints; auth/key errors show banner; 5xx toast | `server/__tests__/api_validation.test.js`, `src/__tests__/App.settingsPersistence.test.jsx` |
| Retrieve portfolio | `GET /api/v1/portfolio/:portfolioId` | Headers: optional `X-Portfolio-Key` | JSON `{ portfolio: {...}, holdings: {...} }` | `200`, `401`, `404`, `429`, `500+` | 401/404 show modal, 5xx toast with retry CTA | `server/__tests__/api_contract.test.js`, `src/__tests__/DashboardNavigation.test.tsx` |
| Admin monitoring snapshot | `GET /api/v1/monitoring` | None | JSON `{ metrics, cache, bruteForce, rateLimit }` | `200`, `401`, `429`, `503`, `500+` | 503 surfaces maintenance banner; 5xx toast | `src/__tests__/AdminTab.test.jsx`, `server/__tests__/monitoring_endpoint.test.js` |
| Security stats summary | `GET /api/v1/security/stats` | None | JSON `{ totals, trends }` | `200`, `401`, `429`, `500+` | Stats pill shows inline error; toast fallback | `src/__tests__/AdminTab.test.jsx`, `server/__tests__/security_events.test.js` |
| Security events feed | `GET /api/v1/security/events?limit=` | Query `limit` (1-500 default 25) | JSON `{ data: Event[], meta }` | `200`, `400`, `401`, `429`, `500+` | Empty state message on 204/empty, toast on 5xx | `src/__tests__/AdminTab.test.jsx`, `server/__tests__/security_events.test.js` |

> **Note:** All endpoints are exposed under `/api/v1/*` with legacy fallback to `/api/*`. The frontend now centralises version negotiation and error mapping in `src/lib/apiClient.js` to keep request metadata consistent.

## Breaking or Ambiguous Contracts

| Severity | Issue | Location | Notes |
| --- | --- | --- | --- |
| P0 | Production build consumed `window.location.origin` as API base, breaking GitHub Pages deployments served from a static domain. | `src/utils/api.js` (pre-refactor) | Resolved by introducing runtime config + central API client with explicit precedence (`window.__APP_CONFIG__` → `config.json` → `VITE_API_URL` → current origin → `http://localhost:3000`). |
| P1 | Timeout policy undocumented and inconsistent between frontend (no timeout) and backend (15s default). | `src/utils/api.js`, `server/config.js` | Standardised on runtime-configurable timeout wired through `src/lib/apiClient.js`. |
| P1 | Lack of runtime config prevented pointing a single build at multiple environments without rebuilds. | Build pipeline docs | Added `public/config.json` contract and documented loader precedence. |
| P2 | Error normalisation duplicated across modules leading to inconsistent request ID propagation. | `src/utils/api.js`, `src/components/AdminTab.jsx` | Shared `ApiClientError` ensures request IDs surface uniformly for toasts/logging. |

## Test Coverage Additions

- Runtime config loader unit tests (Vitest) — **TODO** (pending in follow-up to exercise MSW-based flows with new base resolver).
- API client integration tests with MSW — **TODO**.
- Playwright negative-path (API 500) — **TODO** (blocked until MSW harness updated for new client).

## Follow-up Questions / Missing Inputs

- **Missing:** Authoritative production API base URL for `tooltician.com`; temporary placeholder requires confirmation.
- **Missing:** Updated backend OpenAPI definitions for new monitoring fields introduced after `comprehensive_audit_v3.md`.

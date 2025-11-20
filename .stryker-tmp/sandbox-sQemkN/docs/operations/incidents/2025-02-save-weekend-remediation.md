# Incident Report — Save Workflow & Weekend Pricing (2025-02-14)
> **Status:** Resolved 2025-02-14  
> **Supersedes:** `docs/save_and_weekend_fix.md` and `docs/debug/save_and_weekend.md`

## Summary
- Frontend saves relied solely on `POST /api/portfolio/:id`, so reloads discarded changes and provided no success feedback.
- Weekend or holiday price fetches surfaced as hard errors, producing alarming banners and breaking ROI fallback flows.

## Impact
- Customers could not confirm whether saves succeeded and lost work when refreshing during maintenance windows.
- Weekend deployments generated noisy alerts and masked legitimate pricing regressions because fallback logic aborted early.

## Timeline
- **2025-02-14 — Initial Investigation:** Container environment (Node v20.19.4 / npm 11.4.2). Audit confirmed missing local snapshot, fatal weekend pricing handling, and regression coverage gaps; branch `fix/save-and-weekend` opened.
- **2025-02-14 — Remediation:** Implemented local persistence and market calendar guards, expanded ROI fallback resilience, and began documentation refresh.

## Root Cause Analysis
- **Save workflow:** State persisted only on the server; no cached snapshot existed to rehydrate after reload, and the UI lacked confirmation toasts.
- **Weekend pricing:** The fetch effect treated upstream failures as fatal regardless of market hours, cascading into ROI fallback errors during closures.

## Remediation Actions
- Added a `portfolioStore` that mirrors the active snapshot to `localStorage` (`portfolio-manager-active-portfolio`) and restores it on load.
- Introduced a toast stack that reports save/load successes, validation errors, and local-storage warnings.
- Implemented `getMarketClock` to classify weekends/holidays, show informative alerts, and reuse the latest close until trading resumes.
- Hardened `buildRoiSeries` so per-symbol pricing failures preserve local ROI calculations instead of aborting the fallback.
- Updated README onboarding and troubleshooting guidance to explain persistence and market-closure behaviour.

## Validation
- **Unit:** `src/__tests__/portfolioStore.test.js` confirms snapshot persistence, cloning, and error handling.
- **Integration:** `src/__tests__/App.pricing.test.jsx` covers market-closed messaging in addition to price-refresh degradation checks.
- **Documentation:** README plus this incident log now capture the remediation steps and verification evidence.


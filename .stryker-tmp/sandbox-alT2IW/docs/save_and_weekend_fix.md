# Save Portfolio & Weekend Pricing Remediation

## Root Cause Analysis
- **Save workflow**: the frontend only posted to `/api/portfolio/:id` without caching the result, so reloads lost state and no toast confirmed success.
- **Weekend pricing**: the UI treated any pricing error as a failure, even during market closures, triggering alarming banners and cascading ROI fallback failures when the pricing fetch rejected.

## Implemented Fixes
- Added a dedicated `portfolioStore` that persists the active snapshot to `localStorage` (`portfolio-manager-active-portfolio`) and rehydrates on load.
- Introduced a toast stack for portfolio save/load success, error, and local-storage warning scenarios.
- Implemented market-hours awareness (`getMarketClock`) to classify weekends/holidays, surface informative alerts, and reuse the latest close until trading resumes.
- Hardened ROI fallback (`buildRoiSeries`) against per-symbol pricing failures to keep local ROI computations available when the remote service or cache is stale.
- Updated translations, README guidance, and troubleshooting notes to reflect the new UX and persistence behavior.

## Validation
- Unit: `src/__tests__/portfolioStore.test.js` verifies snapshot persistence, cloning, and error handling.
- Integration: `src/__tests__/App.pricing.test.jsx` covers market-closed messaging alongside existing price-refresh degradation checks.
- Documentation: README and debugging log updated with persistence and market-closure guidance.

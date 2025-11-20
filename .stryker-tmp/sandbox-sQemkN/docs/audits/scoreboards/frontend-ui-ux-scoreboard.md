# Frontend UI & UX Findings Scoreboard

| ID | Title | Severity | Status | Owner | Last Updated | Notes / Evidence |
|----|-------|----------|--------|-------|--------------|------------------|
| UI-1 | ROI fallback exposes stale benchmark lines | High | ✅ Resolved | Frontend UX | 2025-10-21 | Fallback builder now omits benchmark-only keys so the dashboard hides unavailable series; covered by unit test (`src/utils/roi.js`, `src/__tests__/roi.test.js`). |
| UI-2 | Settings toggles misrepresent inactive features | High | ✅ Resolved | Frontend UX | 2025-10-21 | Currency overrides, ROI auto-refresh, and compact table density now wire into runtime behaviour; notifications copy clarifies email digests are pending while push toggles gate in-app toasts (`src/PortfolioManagerApp.jsx`, `src/components/SettingsTab.jsx`, `src/components/TransactionsTab.jsx`). |
| UI-3 | System alerts and toast controls bypass translations | Medium | ✅ Resolved | Frontend UX | 2025-10-22 | Region label and dismiss control now pull from shared i18n keys with EN/ES coverage (`src/PortfolioManagerApp.jsx`, `src/components/ToastStack.jsx`, `src/i18n/translations.js`). |
| UI-4 | Timeline titles expose raw event codes | Medium | ✅ Resolved | Frontend UX | 2025-10-22 | Timeline maps transaction types through translations and narrative templates with regression coverage (`src/utils/history.js`, `src/__tests__/history.utils.test.js`). |
| UI-5 | Share quantities ignore locale number formatting | Medium | ✅ Resolved | Frontend UX | 2025-10-22 | Holdings and transactions tables format shares via `formatNumber`; tests updated for locale-aware output (`src/components/HoldingsTab.jsx`, `src/components/TransactionsTab.jsx`, `src/__tests__/HoldingsTable.test.tsx`). |

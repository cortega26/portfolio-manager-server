# Frontend UI & UX Findings Scoreboard

| ID | Title | Severity | Status | Owner | Last Updated | Notes / Evidence |
|----|-------|----------|--------|-------|--------------|------------------|
| UI-1 | ROI fallback exposes stale benchmark lines | High | ✅ Resolved | Frontend UX | 2025-10-21 | Fallback builder now omits benchmark-only keys so the dashboard hides unavailable series; covered by unit test (`src/utils/roi.js`, `src/__tests__/roi.test.js`). |
| UI-2 | Settings toggles misrepresent inactive features | High | ✅ Resolved | Frontend UX | 2025-10-21 | Currency overrides, ROI auto-refresh, and compact table density now wire into runtime behaviour; notifications copy clarifies email digests are pending while push toggles gate in-app toasts (`src/PortfolioManagerApp.jsx`, `src/components/SettingsTab.jsx`, `src/components/TransactionsTab.jsx`). |
| UI-3 | System alerts and toast controls bypass translations | Medium | Open | Frontend UX | 2025-10-21 | “System alerts” region label and toast dismiss button text are hardcoded in English, breaking i18n (`src/PortfolioManagerApp.jsx:712`, `src/components/ToastStack.jsx:74`). |
| UI-4 | Timeline titles expose raw event codes | Medium | Open | Frontend UX | 2025-10-21 | Activity timeline uses raw transaction.type strings (e.g. BUY) for titles without localisation (`src/utils/history.js:135`). |
| UI-5 | Share quantities ignore locale number formatting | Medium | Open | Frontend UX | 2025-10-21 | Holdings and transaction tables use `toFixed(4)` strings, so thousands separators/local numerals are lost (`src/components/HoldingsTab.jsx:44`, `src/components/TransactionsTab.jsx:130`). |

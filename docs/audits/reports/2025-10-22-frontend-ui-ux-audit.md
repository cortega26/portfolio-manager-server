# Portfolio Manager — Frontend UI/UX Audit

## Executive Summary
- **Assessment date:** 2025-10-21 &nbsp;|&nbsp; **Auditor:** Codex (GPT-5) &nbsp;|&nbsp; **Scope:** React/Vite client, shared UI utilities, Tailwind styling, i18n layer.
- Overall presentation is consistent with the design system (Tailwind + slate/indigo palette) and implements dark-mode, ARIA roles, and responsive layouts across dashboard, holdings, history, metrics, reports, settings, and admin surfaces.
- Two high-severity defects require attention: (1) ROI fallback logic surfaces fabricated benchmark lines, and (2) Settings toggles promise behaviours (currency, notifications, refresh cadence) that are not wired to any runtime logic.
- Medium-priority refinements include tightening localisation coverage (system alerts, toast dismiss, timeline event titles) and aligning number formatting for share counts with the active locale.

## Methodology
1. Reviewed top-level composition (`src/PortfolioManagerApp.jsx`) plus each tab component to catalogue navigation, layout, and messaging patterns.
2. Analysed supporting utilities (`src/utils/*.js`) for data transformations, focusing on ROI, history/timeline, reports, formatting, and settings persistence.
3. Audited translations (`src/i18n/translations.js`) and I18n provider behaviour to verify copy coverage, fallbacks, and locale-sensitive formatting.
4. Evaluated colour usage against WCAG contrast thresholds (spot-checks via luminance calculations) and inspected ARIA roles/labels for assistive technology compatibility.
5. Cross-checked Settings descriptors against runtime usage via code search to confirm whether promised behaviours materialise.

## High-Severity Findings

### UI-1 — ROI fallback exposes fabricated benchmark lines *(Resolved 2025-10-21)*
- **Resolution:** The fallback ROI builder now emits only the locally computed series (portfolio + SPY). Dashboard benchmark toggles filter by data availability, so synthetic blended/ex-cash/cash lines no longer appear during outages. A unit test guards this behaviour (`src/__tests__/roi.test.js`).
- **Impact:** Users no longer see misleading benchmark flats when the remote service is offline; fallback mode stays truthful about which comparisons are available.

### UI-2 — Settings toggles misrepresent inactive features *(Resolved 2025-10-21)*
- **Resolution:** Portfolio settings now drive runtime behaviour: currency overrides flow through the i18n formatter, ROI refresh cadence respects the configured interval, and compact table mode re-densifies holdings/history/transactions layouts. Push notifications toggles gate non-critical toast delivery while email digests are clearly labelled as planned, disabled features. (`src/PortfolioManagerApp.jsx`, `src/components/SettingsTab.jsx`, `src/components/HoldingsTab.jsx`, `src/components/TransactionsTab.jsx`, `src/components/HistoryTab.jsx`)
- **Impact:** Users immediately see a difference when adjusting settings, and the UI no longer advertises unavailable functionality.

## Medium-Severity Findings

### UI-3 — System alerts and toast controls bypass localisation
- Hardcoded English strings remain in the “System alerts” region label and toast dismiss button (`src/PortfolioManagerApp.jsx:712`; `src/components/ToastStack.jsx:74`), so Spanish users encounter untranslated UI chrome.
- **Fix direction:** Pipe these through `t(...)`, adding the missing keys to `translations.js`, and ensure aria-labels are localised.
- **Resolution (2025-10-22):** Region label and toast dismiss actions now rely on shared translation keys with English/Spanish coverage (`src/PortfolioManagerApp.jsx`, `src/components/ToastStack.jsx`, `src/i18n/translations.js`).

### UI-4 — Timeline titles expose raw event codes
- The history timeline assembles titles using the raw `transaction.type` (“BUY”, “SELL”) and a generic “Portfolio” fallback (`src/utils/history.js:135`). Only deposits and withdrawals receive narrative copy, leaving most events terse and untranslated.
- **Fix direction:** Map transaction types to friendly, localised labels (reuse existing `transactions.type.*` keys) and extend narrative templates so buy/sell/dividend actions receive meaningful descriptions.
- **Resolution (2025-10-22):** Timeline entries now map types through translations, add narrative templates for buy/sell/dividend/interest/fee events, and include regression coverage for buy scenarios (`src/utils/history.js`, `src/__tests__/history.utils.test.js`).

### UI-5 — Share quantities ignore locale number formatting
- Holdings and transactions tables render share counts via `toFixed(4)` (`src/components/HoldingsTab.jsx:44`; `src/components/TransactionsTab.jsx:130`), which strips thousands separators and locale digits.
- **Fix direction:** Use `Intl.NumberFormat` (via `formatNumber`) to format share quantities, respecting locale and user measurement settings.
- **Resolution (2025-10-22):** Share quantities flow through `formatNumber`, ensuring locale-aware formatting in holdings and transactions tables with updated unit tests (`src/components/HoldingsTab.jsx`, `src/components/TransactionsTab.jsx`, `src/__tests__/HoldingsTable.test.tsx`).

## Strengths & Positive Observations
- Navigation primitives (`TabBar`, tab panels, aria roles) are accessible, keyboard-friendly, and synchronised with translation keys.
- Dark-mode theming is implemented consistently with Tailwind’s `dark:` variants, maintaining contrast across cards, tables, and alerts.
- The toast stack enforces timeouts and deduplicates entries, while forms display inline validation with descriptive helper text.
- Admin dashboard snapshots surface operational metadata (request IDs, stale NAV flags) with clear status badges, aiding support workflows.

## Recommendations & Next Steps
1. **Prioritise ROI fallback correctness (UI-1).** Add automated coverage and align benchmark toggles with the data actually available during outages.
2. **Monitor settings-driven workflows.** Ensure currency overrides, auto refresh, and density toggles stay exercised in QA and follow-up telemetry once notification channels expand.
3. **Complete localisation sweep (UI-3 & UI-4).** Add missing keys, cover aria-labels, and expand history narratives so every event reads naturally in supported languages.
4. **Adopt locale-aware number utilities (UI-5).** Centralise share formatting alongside currency/percent helpers to keep tables readable for international users.
5. Track remediation progress in `audit/frontend_ui_ux_scoreboard.md` and include evidence (tests, screenshots) when closing findings.

## Artifacts
- Findings scoreboard: `audit/frontend_ui_ux_scoreboard.md`
- Translations reference: `src/i18n/translations.js`
- Primary layout: `src/PortfolioManagerApp.jsx`

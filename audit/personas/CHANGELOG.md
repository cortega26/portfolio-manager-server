# Persona Pain Mitigations — Current Pass

## Summary by Persona

- **Erin Carter**
  - P001 – Friendly Portfolio Controls errors remain in place with request IDs (`src/components/PortfolioControls.jsx`).
  - P002 – Price refresh keeps prior values and alerts on failure (`src/App.jsx`).
  - P003 – README and Reports tab flag importer as upcoming and point to API workflow (`README.md`, `src/components/ReportsTab.jsx`).
- **Marcus Nguyen**
  - P004 – Cash-only transactions bypass price validation and tests guard the flow (`src/components/TransactionsTab.jsx`).
  - P005 – Undefined tickers are filtered before price fetches (`src/App.jsx`).
  - P006 – ROI fallback banner with request IDs prevents silent degradation (`src/App.jsx`).
  - P007 – Settings persist with portfolio payload across devices (`src/App.jsx`, `src/components/SettingsTab.jsx`).
- **Priya Desai**
  - P001 – Shares Erin’s friendly error messaging improvements.
  - P008 – Admin tab exports security events CSV with metadata (`src/components/AdminTab.jsx`, `src/utils/reports.js`).
- **Sofia Ramirez**
  - P009 – Admin dashboard auto-refreshes per configured cadence (`src/components/AdminTab.jsx`).
  - P010 – Stale nightly pricing badges render with request IDs (`src/components/AdminTab.jsx`).
- **Jamal Lee**
  - P003 – Documentation clarity around importer expectations.
  - P011 – Performance CSV includes benchmark series for analytics (`src/utils/reports.js`).

## Severity Delta

| id | persona(s) | pain | severity_before | severity_after | playbook_step |
| --- | --- | --- | --- | --- | --- |
| P001 | Erin Carter; Priya Desai | Portfolio Controls surfaces raw HTTP errors | Critical | Low | #low-continuous-improvement |
| P002 | Erin Carter | Price fetch failures zero out holdings | Critical | Low | #low-continuous-improvement |
| P003 | Erin Carter; Jamal Lee | README promises an import workflow that the UI lacks | Critical | Negligible | #negligible-monitor-only |
| P004 | Marcus Nguyen | Cash-only transactions require a price input | Critical | Negligible | #negligible-monitor-only |
| P005 | Marcus Nguyen | Undefined tickers trigger /prices/undefined | High | Negligible | #negligible-monitor-only |
| P006 | Marcus Nguyen | ROI fallback runs silently after API errors | High | Low | #low-continuous-improvement |
| P007 | Marcus Nguyen | Display settings persist only locally | Critical | Low | #low-continuous-improvement |
| P008 | Priya Desai | Admin tab lacks security event export | High | Negligible | #negligible-monitor-only |
| P009 | Sofia Ramirez | Admin metrics do not auto-refresh | Critical | Low | #low-continuous-improvement |
| P010 | Sofia Ramirez | stale_price flag never reaches UI | High | Low | #low-continuous-improvement |
| P011 | Jamal Lee | Performance CSV omits benchmark columns | High | Negligible | #negligible-monitor-only |

All tracked pains remain mitigated; severity is downgraded accordingly and referenced in `docs/severity_matrix.csv` and `docs/scoreboard.csv`.

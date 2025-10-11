# Debug Log — Save Portfolio & Weekend Issues

## 2025-02-14 — Initial Investigation
- Environment: container (Node v20.19.4 / npm 11.4.2).
- Actions: created branch `fix/save-and-weekend`, baseline audit of frontend state management and server finance stack.
- Findings:
  - `PortfolioManagerApp` persists portfolios only via API; no local snapshot to survive reload.
  - Price refresh effect treats any fetch failure as fatal error; no market-hours awareness.
- Next: implement persistent portfolio store and market calendar guard, then add regression tests.

## 2025-02-14 — Remediation Summary
- Added toast stack + local snapshot store so successful saves persist across reloads.
- Market clock guard now treats weekends/holidays as informational, reusing last close and deferring refresh until the next open.
- ROI fallback handles per-ticker pricing failures without aborting the client computation.

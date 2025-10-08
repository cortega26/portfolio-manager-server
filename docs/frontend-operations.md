<!-- markdownlint-disable -->
# Frontend Operations Playbook

## Purpose

This playbook standardizes how to operate, verify, and troubleshoot the Vite/React frontend after the Phase 4 dashboard upgrades (benchmark toggles, refreshed KPIs, Admin tab observability). Use it whenever deploying UI changes, triaging incidents, or training on-call engineers.

## Roles & Responsibilities

| Role | Primary Responsibilities | Handoff Notes |
|------|--------------------------|---------------|
| Frontend On-Call | Execute smoke tests, validate benchmark toggles & KPIs, watch Admin tab metrics post-deploy. | Rotate weekly with backend on-call; share findings in #portfolio-ops channel. |
| Release Captain | Coordinate deployment windows, ensure README + scoreboard remain current, track rollout checklist completion. | Owns rollback decision within 15 minutes of detected regression. |
| Observability Lead | Maintain dashboards surfaced in Admin tab and `/api/monitoring`, ensure alerts route to PagerDuty. | Update runbooks when new metrics are added. |

## Configuration Reference

| Name | Type | Default | Required | Description |
|------|------|---------|----------|-------------|
| `VITE_API_BASE` | string (URL) | `http://localhost:3000/api/v1` | ✅ | API base path consumed by frontend queries, including Admin tab monitoring. |
| `VITE_FEATURE_BENCHMARK_TOGGLES` | boolean (`"true" \| "false"`) | `true` | ✅ | Enables benchmark toggle controls on the dashboard ROI chart; leave enabled for Phase 4 baseline. |
| `VITE_FEATURE_KPI_REFRESH` | boolean (`"true" \| "false"`) | `true` | ✅ | Enables refreshed KPI panel with cash drag + benchmark deltas. |
| `VITE_ADMIN_POLL_INTERVAL_MS` | number | `15000` | ✅ | Poll frequency (ms) for Admin tab monitoring fetches. Increase temporarily if rate limits approach thresholds. |
| `LOG_LEVEL` | string (`"info" \| "debug" \| "error"`) | `info` | ✅ | Controls frontend structured logging verbosity surfaced in browser console output. |

> **Note:** Feature toggles must remain consistent with backend exposure. When disabling toggles for a canary, document rationale in the deployment record and link to scoreboard evidence.

## Deployment Workflow

1. **Pre-Deploy Checklist**
   - Review merged PRs affecting `src/components/DashboardTab.jsx`, `src/components/AdminTab.jsx`, or shared hooks.
   - Confirm README and `docs/HARDENING_SCOREBOARD.md` are already updated (Phase 4 lock-step requirement).
   - Verify feature flag values in the target environment configuration.
2. **Deploy** via the standard CI/CD pipeline (see README §Deployment). Ensure release artifacts include hashed filenames and environment variables are set before `npm run build`.
3. **Post-Deploy Verification Window (first 30 minutes)**
   - Execute smoke tests (below) on production and staging URLs.
   - Announce completion status in #portfolio-ops. Attach screenshots when toggles or KPIs change.

## Smoke Test Checklist

1. Load the dashboard homepage.
   - Expect ROI chart to render with default benchmark (SPY) and toggles visible.
2. Toggle to **Blended Benchmark** and **Ex-Cash** modes.
   - Confirm legend updates and series visibility changes without console errors (check browser devtools).
   - Use the **Reset** button to restore SPY + Blended default and verify the control disables itself once the default blend is active.
   - Refresh the page to ensure the selection persists (localStorage backed preference).
3. Validate KPI cards.
   - Ensure Cash Allocation %, Cash Drag Impact, SPY Delta, and Blended Benchmark Delta display values consistent with staging snapshots.
   - Hover tooltips should reference `docs/cash-benchmarks.md` terminology.
4. Confirm Admin tab renders monitoring data.
   - Security Events table updates on 15s interval without 429 responses.
   - Rate limit and cache gauges should match `/api/monitoring` JSON response (spot-check via curl or browser network tab).
5. Run accessibility spot checks (see below).

Record results in the release ticket. Flag any discrepancies for immediate triage.

## Accessibility & UX Checks

- Run `npm run lint` (includes axe rules via eslint-plugin-jsx-a11y) prior to deployment.
- Use browser DevTools Lighthouse (Accessibility category ≥ 90) on dashboard and Admin tab.
- Keyboard navigation:
  - `Tab` cycles through benchmark toggle buttons and KPI info icons in order.
  - `Space`/`Enter` toggles the focused benchmark option with aria-live announcement.
- Screen reader labels:
  - ROI chart toggles announce "Benchmark mode" + selected option.
  - KPI cards expose aria-describedby linking to tooltip copy.

## Benchmark Toggle Verification

1. Navigate to Dashboard → ROI Chart.
2. Confirm the segmented control shows all enabled benchmark modes (SPY, Blended, Ex-Cash, Cash).
3. For each toggle:
   - Click to activate.
   - Observe chart updates (line color + legend entry).
   - Check Admin tab → Feature Flags section to verify `VITE_FEATURE_BENCHMARK_TOGGLES` is `true`.
4. Use browser network tab to confirm `/api/returns/daily` responses contain benchmark arrays; if missing, escalate to backend on-call.
5. Activate at least one non-default toggle, reload the page, then use **Reset** to confirm the default SPY + Blended pairing returns without a second reload.

## KPI Refresh Validation

1. On Dashboard → KPI panel, review displayed metrics:
   - Cash Allocation %
   - Cash Drag Impact
   - SPY Delta
   - Blended Benchmark Delta
2. Compare with Admin tab → Portfolio Metrics preview (if enabled) or backend `/api/benchmarks/summary` values.
3. Ensure numeric formatting matches README specification (percentage with two decimals, prefix +/− for deltas).
4. Trigger a hard refresh to confirm KPIs hydrate correctly without caching artifacts.

## Admin Tab Operations

- **Security Events Stream:** Validate new events appear in chronological order with request IDs. If lag exceeds 30s, inspect browser console for WebSocket/polling errors.
- **Rate Limit Metrics:** If `remaining` drops below 25% for more than 5 minutes, coordinate with backend to adjust thresholds or throttle polling via `VITE_ADMIN_POLL_INTERVAL_MS`.
- **Benchmark Health Widget:** Use this to spot mismatches between SPY and blended calculations post-deploy. Escalate discrepancies >50 bps to backend.
- **Nightly Pricing Freshness:** The Admin tab surfaces the latest NAV snapshot and highlights when the nightly job sets `stale_price=true`. Investigate before market open if the banner reports stale data.
- **Security Event Exports:** Download the CSV directly from the Admin tab when compliance requests audit trails. The export mirrors the columns documented in `docs/SECURITY.md`.

## Incident Response (UI Regressions)

1. **Detection:** Alerts originate from synthetic checks (smoke test failures) or Admin tab anomalies (e.g., missing benchmark series).
2. **Immediate Actions (within 15 minutes):**
   - Toggle feature flags off if regression isolates to benchmark/KPI features.
   - Revert to previous production build via CI/CD rollback job (`deploy:rollback --env <env>`).
   - Capture console logs with request IDs for correlation.
3. **Communication:**
   - Update incident channel with status, impacted components, and mitigation steps.
   - Reference this playbook section in the incident doc for auditability.
4. **Post-Incident:**
   - File a retrospective referencing relevant scoreboard rows (P4-UI-1, P4-UI-2).
   - Update this playbook if new mitigation steps emerge.

## Deployment Verification Evidence

- **Smoke Tests:** Document execution time, environment, and pass/fail status in the release ticket. Link to screenshots and console logs when deviations occur.
- **Accessibility Checks:** Attach Lighthouse reports demonstrating ≥90 Accessibility score to the ticket.
- **Scoreboard Sync:** After each deployment affecting the frontend, update `docs/HARDENING_SCOREBOARD.md` Phase 4 section with status (DONE/IN PROGRESS) and link to the release PR.
- **README Reference:** Ensure README §Operations references this playbook and includes the latest configuration table excerpt.

## Revision History

- 2025-10-10 — Initial publication covering P4-UI-1 benchmark toggles, P4-UI-2 KPI refresh, and Admin tab workflows.

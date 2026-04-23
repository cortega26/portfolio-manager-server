# Strategic Redesign — Implementation Spec

> Origin: `docs/implementation/portfolio-manager-strategic-redesign-plan.md` + `docs/backlog/portfolio-manager-strategic-redesign-backlog.md`
> Created: 2026-04-22
> Status: Active

---

## 1. Goals

Transform this app from "10 tabs of portfolio information" into "a trusted daily review system for a real investor."

Five structural problems to solve:

1. **Too many surfaces** — exposes unfiltered data before clarifying what matters now
2. **Computes more than it explains** — numbers have no source, freshness, or confidence
3. **Signals without action loops** — detects events but does not convert them to decisions
4. **Ledger as secondary workflow** — import and reconciliation are buried
5. **Logic concentrated in few oversized modules** — every feature touches the same 3 files

### Product outcomes

| Dimension             | Target                                                                              |
| --------------------- | ----------------------------------------------------------------------------------- |
| Time to first insight | < 30 seconds after app open                                                         |
| Every material metric | Shows source, freshness, confidence                                                 |
| Recommendations       | Grounded in portfolio policy, not just threshold crossings                          |
| Ledger maintenance    | Guided workflow, not scanning a giant table                                         |
| Code hot spots        | `PortfolioManagerApp.jsx`, `TransactionsTab.jsx`, `portfolio.ts` materially reduced |

---

## 2. Milestones

| Milestone | Focus                                                               | Exit condition                                                             |
| --------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| M1        | Foundation (trust schema, feature flags, i18n fix, health endpoint) | Types exist, flags work, no raw i18n keys on primary surfaces              |
| M2        | Trust Layer + Today Shell                                           | Every primary metric shows trust metadata; Today tab available behind flag |
| M3        | Ledger Operations Center                                            | Import preview, exception queue, reconciliation status visible             |
| M4        | Policy Guidance                                                     | Inbox is a policy-backed recommendation queue with rationale               |
| M5        | Architecture consolidation                                          | Hot spots materially reduced, legacy surfaces retired                      |

---

## 3. Feature Flag Strategy (SR-100)

**Contract:**

- Flags live in `src/lib/featureFlags.js` (renderer) and referenced via `src/hooks/useFeatureFlag.js`
- Renderer reads overrides from `localStorage` key `portfolio-manager-feature-flags`
- Default state: all new surfaces are **off** unless explicitly enabled

**Flags introduced in this redesign:**

| Flag                       | Default | Guards                                     |
| -------------------------- | ------- | ------------------------------------------ |
| `redesign.todayShell`      | `false` | Today tab, review-first navigation         |
| `redesign.trustBadges`     | `false` | Trust badges on dashboard/prices/inbox     |
| `redesign.ledgerOpsCenter` | `false` | Import preview, exception queue, ledger UI |
| `redesign.policyGuidance`  | `false` | Policy evaluation, recommendation queue    |

**Verification:**

- `useFeatureFlag('redesign.todayShell')` returns `false` with no localStorage override
- Setting `localStorage.setItem('portfolio-manager-feature-flags', JSON.stringify({ 'redesign.todayShell': true }))` makes the Today tab appear
- Flag state survives page reload

---

## 4. Trust Metadata Schema (SR-001)

**Contract** (`shared/trust.ts`):

```ts
export type SourceType = 'live' | 'eod' | 'eod_estimated' | 'manual' | 'cached' | 'unknown';
export type FreshnessState = 'fresh' | 'stale' | 'expired' | 'unknown';
export type ConfidenceState = 'high' | 'medium' | 'low' | 'degraded' | 'unknown';
export type DegradedReason =
  | 'missing_price'
  | 'stale_price'
  | 'partial_data'
  | 'provider_error'
  | 'no_transactions'
  | 'unresolved_exceptions';

export interface TrustMetadata {
  source_type: SourceType;
  freshness_state: FreshnessState;
  confidence_state: ConfidenceState;
  degraded_reason?: DegradedReason;
  as_of?: string; // ISO-8601
  explanation?: string;
}
```

**Rules:**

- `high` confidence requires `fresh` freshness and `live` or `eod` source
- `degraded` confidence always carries a `degraded_reason`
- Frontend and backend both import from `shared/trust.ts`

**Verification:**

- TypeScript compilation succeeds with no errors
- Every trust state combination can be round-tripped through JSON
- `confidence_state: 'high'` without `freshness_state: 'fresh'` is flagged in validator

---

## 5. i18n defaultValue Fix (SR-007)

**Problem:**
`t('dashboard.zone2.empty', { defaultValue: 'No alerts...' })` renders the raw key `dashboard.zone2.empty` because:

1. The key is not in `translations.js`
2. The `translate()` function uses `vars` only for `{token}` interpolation, ignoring `defaultValue`

**Fix** (`src/i18n/I18nProvider.jsx`):

```js
const translate = useCallback(
  (key, vars) => {
    const { defaultValue, ...interpolationVars } = vars ?? {};
    const table = translations[language] ?? translations[FALLBACK_LANGUAGE];
    const fallbackTable = translations[FALLBACK_LANGUAGE] ?? {};
    const template = table[key] ?? fallbackTable[key] ?? defaultValue ?? key;
    return interpolate(template, interpolationVars);
  },
  [language]
);
```

**Keys requiring translation entries** (add to `translations.js` `en` table):

- `dashboard.zone2.empty` → `'No alerts or action items. Portfolio is up to date.'`
- `dashboard.zone2.emptyAria` → `'Action inbox'`
- `dashboard.charts.title` → `'Portfolio charts'`

**Verification:**

- `t('dashboard.zone2.empty')` returns `'No alerts or action items. Portfolio is up to date.'` (from translations table)
- `t('unknown.key', { defaultValue: 'Fallback' })` returns `'Fallback'` (from defaultValue)
- `t('unknown.key')` returns `'unknown.key'` (raw key, no defaultValue)
- Playwright screenshot of empty-inbox state shows no raw key strings

---

## 6. Portfolio Health Summary (SR-002)

**Endpoint:** `GET /api/portfolio/:id/health`

**Response contract:**

```json
{
  "portfolio_id": "string",
  "freshness_state": "fresh | stale | expired | unknown",
  "confidence_state": "high | medium | low | degraded | unknown",
  "degraded_reasons": ["missing_price"],
  "unresolved_exception_count": 0,
  "action_count": 0,
  "last_reviewed_at": "ISO-8601 | null",
  "as_of": "ISO-8601"
}
```

**Logic:**

- `freshness_state`: derived from the oldest price timestamp in open holdings
  - all prices < 1 trading day old → `fresh`
  - any price 1–3 trading days old → `stale`
  - any price > 3 trading days old → `expired`
  - no prices → `unknown`
- `confidence_state`:
  - `high` if freshness is fresh and no degraded reasons
  - `medium` if stale or 1 degraded reason
  - `low` if expired or 2+ degraded reasons
  - `degraded` if confidence cannot be computed
- `action_count`: count of HIGH urgency inbox items
- `unresolved_exception_count`: initially 0 (placeholder until SR-040 exists)

**Verification:**

- `GET /api/portfolio/test-id/health` returns 200 with all required fields present
- With fresh prices: `freshness_state === 'fresh'` and `confidence_state === 'high'`
- With stale prices (>1 day): `freshness_state === 'stale'`
- With no prices in holdings: `freshness_state === 'unknown'`

---

## 7. Trust Metadata in Price/Analytics Responses (SR-003)

**Price bulk endpoint** — extend each symbol's `symbolMeta` with trust fields:

```json
"SPY": {
  "status": "eod_fresh",
  "trust": {
    "source_type": "eod",
    "freshness_state": "fresh",
    "confidence_state": "high",
    "as_of": "2026-04-22T16:00:00Z"
  }
}
```

**Analytics endpoint** — add top-level `trust` field to ROI/performance response.

**Source type mapping** from existing price status:
| Existing status | source_type | freshness_state | confidence_state |
|---|---|---|---|
| `live` | `live` | `fresh` | `high` |
| `eod_fresh` | `eod` | `fresh` | `high` |
| `cache_fresh` | `cached` | `stale` | `medium` |
| `degraded` | `cached` | `stale` | `low` |
| `unavailable` | `unknown` | `unknown` | `degraded` |

**Verification:**

- Price bulk response includes `trust.source_type` per symbol
- Analytics response includes top-level `trust` object
- Status mapping is consistent with the table above

---

## 8. Trust Badge UI Components (SR-004)

**Components** (`src/components/shared/`):

### `TrustBadge.jsx`

Props: `{ trust: TrustMetadata, compact?: boolean }`

Visual contract:

- `high` / `fresh`: green dot + "Live" or "EOD" label
- `medium` / `stale`: amber dot + "Stale" label
- `low` / `degraded`: red dot + reason label
- `unknown`: grey dot + "No data" label

### `TrustTooltip.jsx`

Props: `{ trust: TrustMetadata, children: ReactNode }`

- Wraps children in a tooltip showing source, freshness, as_of, explanation

**Verification:**

- `<TrustBadge trust={{ source_type: 'live', freshness_state: 'fresh', confidence_state: 'high' }} />` renders green
- `<TrustBadge trust={{ confidence_state: 'degraded', degraded_reason: 'missing_price' }} />` renders red
- Both have `aria-label` attributes

---

## 9. Trust on Dashboard Primary Metrics (SR-005)

- NAV card: add `TrustBadge` using ROI endpoint's `trust` field (behind `redesign.trustBadges` flag)
- ROI card: add `TrustBadge` using analytics `trust` field
- When flag is off: no trust UI shown (backward compatible)

**Verification:**

- With `redesign.trustBadges = true`: NAV card contains a TrustBadge element
- With `redesign.trustBadges = false`: no TrustBadge rendered
- Existing dashboard tests still pass

---

## 10. Inbox Rationale Cards (SR-006)

**Backend:** Extend `InboxItem` with `rationale?: string` field describing why the item exists.

**Frontend:** Show rationale text below description in inbox card when present.

**Verification:**

- THRESHOLD_TRIGGERED items have non-empty `rationale` in API response
- Rationale text is visible in Inbox UI when items exist

---

## 11. Review-First Navigation Model (SR-020)

**Flag behavior:**

- `redesign.todayShell = false`: all existing tabs, no change
- `redesign.todayShell = true`: `Today` tab added as first tab rendering `TodayTab`

**Verification:**

- With flag off: TabBar renders unchanged
- With flag on: `Today` tab is first and renders `TodayTab` component
- All legacy tabs remain accessible even with flag on

---

## 12. Today Shell (SR-021)

**Component:** `src/components/review/TodayTab.jsx`

**Structure:**

```
TodayTab
├── PortfolioHealthBar        (health endpoint)
├── NeedsAttentionSection     (SR-022)
├── RecentChangesSection      (SR-023)
└── DataBlockersSection       (SR-024)
```

**States that must be handled:** loading, healthy, needs_attention, blocked, error.

**Verification:**

- Today tab renders without errors in all five states
- NeedsAttentionSection shows "You're up to date" when inbox is empty
- DataBlockersSection shows degraded reasons from health endpoint

---

## 13. NeedsAttentionSection (SR-022)

Descriptive empty state required: "No action needed — your portfolio is on track."
Items sorted by urgency (HIGH first).

---

## 14. RecentChangesSection (SR-023)

Compares current NAV snapshot to localStorage-persisted previous snapshot.
Descriptive empty state: "No meaningful changes since your last review."

---

## 15. DataBlockersSection (SR-024)

Shows holdings with missing/stale prices and degraded health reasons.
Empty state: "All data is current."

---

## 16. PortfolioManagerApp.jsx Decomposition (SR-080)

Extract to:

- `src/hooks/usePortfolioData.js` — all data-fetching state + effects
- `src/hooks/usePortfolioActions.js` — all mutation handlers

**Goal:** File shrinks from 1,788 lines to < 800 lines.
**Constraint:** Zero behavior change. All existing tests pass.

---

## 17. Portfolio Routes Decomposition (SR-082)

Split `server/routes/portfolio.ts` into:

- `server/routes/portfolioCore.ts` — GET/PATCH portfolio, holdings, transactions
- `server/routes/portfolioInbox.ts` — inbox compute + reviews
- `server/routes/portfolioHealth.ts` — health summary
- `server/routes/portfolioLedger.ts` — import sessions, exceptions

---

## 18. Ledger State Model (SR-040/041)

Types in `server/types/import.ts`:

- `ImportSession` with status enum: pending | previewing | applying | applied | failed | cancelled
- `LedgerException` with type enum: duplicate | ambiguous | unsupported | missing_price | missing_field

---

## 19. Import Session Endpoints (SR-042)

- `GET /api/portfolio/:id/import-sessions`
- `GET /api/portfolio/:id/import-sessions/:sessionId/exceptions`
- `PATCH /api/portfolio/:id/import-sessions/:sessionId/exceptions/:exceptionId`

---

## 20. Import Preview Flow (SR-043)

- `POST /api/portfolio/:id/import/preview` → non-mutating, returns delta
- `POST /api/portfolio/:id/import/apply` → idempotent apply, returns delta summary

---

## 21. Ledger Operations Center UI (SR-044)

Components in `src/components/ledger/`:

- `LedgerOpsCenter.jsx`, `ImportSessionList.jsx`, `ExceptionQueue.jsx`, `ImportPreviewModal.jsx`
  All behind `redesign.ledgerOpsCenter` flag.

---

## 22. Portfolio Policy Schema (SR-060)

`shared/policy.ts` with `PortfolioPolicy` interface and `DEFAULT_POLICY` opinionated defaults.

---

## 23. Policy Evaluation Service (SR-061)

`server/services/policyEvaluator.ts` — pure function producing `PolicyRecommendation[]` with type, severity, rationale, evidence.

---

## 24. Inbox as Recommendation Queue (SR-062)

- Inbox items get `source: 'threshold' | 'policy'` field
- New lifecycle states: active | acknowledged | snoozed | dismissed | resolved
- Policy items merged behind `redesign.policyGuidance` flag

---

## 25. Verification Summary

| SR         | Verification method                                           |
| ---------- | ------------------------------------------------------------- |
| SR-007     | Unit test translate(); Playwright snapshot of empty dashboard |
| SR-100     | Unit test useFeatureFlag(); localStorage toggle test          |
| SR-001     | TypeScript compilation; validator unit tests                  |
| SR-002     | API integration test; freshness logic unit tests              |
| SR-003     | API response assertion in tests                               |
| SR-004     | Component snapshot; aria-label check                          |
| SR-005     | Component test with flag mocked on/off                        |
| SR-006     | API test for rationale field; component render test           |
| SR-020     | Component test for flag-gated tab                             |
| SR-021     | Component tests for all 5 states; Playwright smoke            |
| SR-022–024 | Component tests: empty state + data state                     |
| SR-080     | `wc -l` check; existing tests pass                            |
| SR-082     | Module existence check; existing tests pass                   |
| SR-040/041 | TypeScript compilation                                        |
| SR-042     | API integration tests                                         |
| SR-043     | Integration test: preview is non-mutating                     |
| SR-044     | Component render tests                                        |
| SR-060     | Unit tests for policy validator                               |
| SR-061     | Pure function unit tests                                      |
| SR-062     | Integration test: threshold + policy items merged             |

---

## 26. Non-Goals

- AI chat assistant, brokerage execution, mobile apps, social features, more charts

---

## 27. Quality Gates

1. `npm test` passes with no regressions
2. `npm run lint` zero warnings
3. TypeScript compilation clean
4. No raw i18n keys on primary surfaces
5. Trust metadata present on every new metric-producing API endpoint
6. All new code has test coverage

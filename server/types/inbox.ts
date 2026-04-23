// server/types/inbox.ts
// Domain types for the Action Inbox (Phase 5).

/**
 * The four event types the inbox produces.
 * Add new types only after these four are stable.
 */
export type InboxEventType =
  | 'THRESHOLD_TRIGGERED'
  | 'LARGE_MOVE_UNREVIEWED'
  | 'LONG_UNREVIEWED'
  | 'NO_THRESHOLD_CONFIGURED';

/** Urgency controls sort order in the feed. */
export type InboxUrgency = 'HIGH' | 'MEDIUM' | 'LOW';

/** URGENCY_ORDER[u] gives a numeric sort key — lower = higher urgency. */
export const URGENCY_ORDER: Record<InboxUrgency, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
};

/** One actionable item in the inbox feed. All monetary values serialized as strings. */
export interface InboxItem {
  ticker: string;
  eventType: InboxEventType;
  /** Deterministic key identifying this specific event instance. Used for dismiss. */
  eventKey: string;
  urgency: InboxUrgency;
  /** Human-readable description of the event (e.g. "Crossed −15% threshold (currently −17.2%)") */
  description: string;
  /** Current shares held (as Decimal string, e.g. "12.50000000") */
  shares: string;
  /** Current position value in USD (shares × currentPrice), serialized as string or null */
  currentValue: string | null;
  /** Latest price (serialized as string) */
  currentPrice: string | null;
  /** ISO-8601 date of the price */
  currentPriceAsOf: string | null;
  /** For THRESHOLD_TRIGGERED: the configured percent window */
  thresholdPct?: number;
  /** For THRESHOLD_TRIGGERED: BUY_ZONE | TRIM_ZONE */
  signalStatus?: string;
  /** For LARGE_MOVE_UNREVIEWED: percent move from reference price */
  movePct?: number;
  /** For LONG_UNREVIEWED: trading days elapsed since last review */
  tradingDaysUnreviewed?: number;
  /** Human-readable explanation of why this item was generated (SR-006) */
  rationale?: string;
  /** Source of this item: from a signal threshold or a policy rule (SR-006) */
  source?: 'threshold' | 'policy';
}

/** A row from the inbox_reviews table. */
export interface InboxReviewRecord {
  id?: number;
  portfolio_id: string;
  ticker: string;
  event_type: InboxEventType;
  event_key: string;
  dismissed_at: string; // ISO-8601
}

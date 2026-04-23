/**
 * shared/trust.ts
 *
 * SR-001 — Trust metadata schema.
 *
 * TrustMetadata describes how confident the system is in a given data point
 * (typically a price or valuation) and why it may be degraded.
 *
 * This module is intentionally dependency-free so it can be imported by
 * both the Fastify server and the React renderer without side effects.
 */

/** Where the underlying data was sourced from. */
export type SourceType =
  | 'live' // Real-time market feed
  | 'eod' // End-of-day official close
  | 'eod_estimated' // Estimated end-of-day value
  | 'manual' // User-entered value
  | 'cached' // Previously fetched value still within acceptable TTL
  | 'unknown'; // Source cannot be determined

/**
 * How fresh (temporally current) the data is.
 */
export type FreshnessState =
  | 'fresh' // Sourced from a live or EOD feed within the current session
  | 'stale' // Cached value, age is acceptable but data source is unavailable
  | 'expired' // Data is too old to support a confident decision
  | 'unknown'; // Cannot determine freshness

/**
 * Overall data confidence level combining freshness and source quality.
 */
export type ConfidenceState =
  | 'high' // Live or EOD data from a known good source
  | 'medium' // Cached data within acceptable TTL
  | 'low' // Stale cached data
  | 'degraded' // Missing, unavailable, or error state
  | 'unknown'; // No information available

/** Machine-readable reason explaining why data confidence is reduced. */
export type DegradedReason =
  | 'missing_price'
  | 'stale_price'
  | 'partial_data'
  | 'provider_error'
  | 'no_transactions'
  | 'unresolved_exceptions';

/** Complete trust metadata attached to any metric or price data point. */
export interface TrustMetadata {
  /** Where the data was sourced from. */
  source_type: SourceType;

  /** Temporal freshness classification. */
  freshness_state: FreshnessState;

  /** Overall confidence in this data point. */
  confidence_state: ConfidenceState;

  /**
   * ISO-8601 UTC timestamp of when the underlying data was fetched or computed.
   * May be absent when source is 'unknown'.
   */
  as_of?: string | null;

  /**
   * Machine-readable reason code explaining why trust is less than 'high'.
   * Only present when confidence_state is 'degraded' or 'low'.
   */
  degraded_reason?: DegradedReason;

  /** Optional human-readable explanation for UI surfaces. */
  explanation?: string;
}

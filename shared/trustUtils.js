/**
 * shared/trustUtils.js
 *
 * SR-001/003 — Trust metadata utilities.
 *
 * Pure functions for building TrustMetadata objects.
 * Importable by both Fastify server (Node.js) and Vite renderer (browser).
 *
 * Schema (matches test expectations):
 * {
 *   source_type:     'live' | 'eod' | 'cached' | 'unknown'
 *   freshness_state: 'fresh' | 'stale' | 'unknown'
 *   confidence_state:'high' | 'medium' | 'low' | 'degraded' | 'unknown'
 *   as_of?:          string | null
 *   degraded_reason?: string   (only present when confidence is degraded/low)
 * }
 *
 * @typedef {'live' | 'eod' | 'cached' | 'unknown'} SourceType
 * @typedef {'fresh' | 'stale' | 'unknown'} FreshnessState
 * @typedef {'high' | 'medium' | 'low' | 'degraded' | 'unknown'} ConfidenceState
 *
 * @typedef {object} TrustMetadata
 * @property {SourceType} source_type
 * @property {FreshnessState} freshness_state
 * @property {ConfidenceState} confidence_state
 * @property {string|null} [as_of]
 * @property {string} [degraded_reason]
 */

/**
 * Maps a price status string (from the server's price normalization logic)
 * to a canonical trust mapping key.
 *
 * These values match the output of `normalizePricingStatusSummary()` in
 * `server/routes/prices.ts`.
 *
 * @type {Record<string, string>}
 */
export const PRICE_STATUS_TO_TRUST = {
  live: 'live',
  eod_fresh: 'eod_fresh',
  cache_fresh: 'cache_fresh',
  degraded: 'degraded',
  unavailable: 'unavailable',
};

/**
 * Maps from a canonical price status string to a TrustMetadata object.
 *
 * @param {string} priceStatus - value from normalizePricingStatusSummary()
 * @param {string|null} [as_of] - ISO-8601 timestamp or null
 * @returns {TrustMetadata}
 */
export function buildTrustFromPriceStatus(priceStatus, as_of) {
  switch (priceStatus) {
    case 'live':
      return {
        source_type: 'live',
        freshness_state: 'fresh',
        confidence_state: 'high',
        ...(as_of != null ? { as_of } : {}),
      };

    case 'eod_fresh':
      return {
        source_type: 'eod',
        freshness_state: 'fresh',
        confidence_state: 'high',
        ...(as_of != null ? { as_of } : {}),
      };

    case 'cache_fresh':
      return {
        source_type: 'cached',
        freshness_state: 'stale',
        confidence_state: 'medium',
        ...(as_of != null ? { as_of } : {}),
      };

    case 'degraded':
      return {
        source_type: 'cached',
        freshness_state: 'stale',
        confidence_state: 'low',
        degraded_reason: 'stale_price',
        ...(as_of != null ? { as_of } : {}),
      };

    case 'unavailable':
      return {
        source_type: 'unknown',
        freshness_state: 'unknown',
        confidence_state: 'degraded',
        degraded_reason: 'missing_price',
      };

    default:
      return {
        source_type: 'unknown',
        freshness_state: 'unknown',
        confidence_state: 'degraded',
        degraded_reason: 'provider_error',
      };
  }
}

/**
 * Builds a TrustMetadata object representing unknown trust
 * (used when no price information is available at all).
 *
 * @returns {TrustMetadata}
 */
export function buildUnknownTrust() {
  return {
    source_type: 'unknown',
    freshness_state: 'unknown',
    confidence_state: 'unknown',
  };
}

/**
 * Returns true only when the trust metadata indicates high confidence.
 *
 * @param {TrustMetadata} trust
 * @returns {boolean}
 */
export function isTrustHigh(trust) {
  return trust.confidence_state === 'high';
}

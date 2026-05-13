/**
 * src/components/shared/TrustBadge.jsx
 *
 * SR-004 — Trust badge component.
 *
 * A small pill/badge that shows the confidence level of a data point.
 * Uses semantic color-coding: green = high, yellow = medium, orange = low, red = none.
 *
 * Props:
 *   trust: TrustMetadata — the trust object from the API
 *   size?: 'sm' | 'md'  — badge size (default: 'sm')
 *   className?: string  — additional Tailwind classes
 */

import PropTypes from 'prop-types';

const CONFIDENCE_STYLES = {
  high: 'bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-300',
  medium: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  low: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  degraded: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
  unknown: 'bg-surface-100 text-surface-500 dark:bg-surface-800 dark:text-surface-400',
};

const FRESHNESS_LABELS = {
  fresh: 'Live',
  stale: 'Cached',
  unknown: 'Unknown',
};

const SIZE_STYLES = {
  sm: 'px-1.5 py-0.5 text-xs',
  md: 'px-2 py-1 text-sm',
};

/**
 * @param {{ trust: import('../../types/trust').TrustMetadata, size?: 'sm' | 'md', className?: string }} props
 */
export function TrustBadge({ trust, size = 'sm', className = '' }) {
  if (!trust) return null;

  const confidenceStyle = CONFIDENCE_STYLES[trust.confidence_state] ?? CONFIDENCE_STYLES.unknown;
  const sizeStyle = SIZE_STYLES[size] ?? SIZE_STYLES.sm;
  const label = FRESHNESS_LABELS[trust.freshness_state] ?? trust.confidence_state ?? 'Unknown';

  return (
    <span
      className={`inline-flex items-center rounded font-medium leading-none ${confidenceStyle} ${sizeStyle} ${className}`}
      aria-label={`Data trust: ${label}`}
      title={trust.as_of ? `As of ${trust.as_of}` : undefined}
    >
      {label}
    </span>
  );
}

TrustBadge.propTypes = {
  trust: PropTypes.shape({
    confidence_state: PropTypes.oneOf(['high', 'medium', 'low', 'degraded', 'unknown']).isRequired,
    freshness_state: PropTypes.oneOf(['fresh', 'stale', 'expired', 'unknown']).isRequired,
    source_type: PropTypes.string.isRequired,
    as_of: PropTypes.string,
    degraded_reason: PropTypes.string,
  }).isRequired,
  size: PropTypes.oneOf(['sm', 'md']),
  className: PropTypes.string,
};

export default TrustBadge;

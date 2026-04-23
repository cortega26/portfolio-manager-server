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
  high: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  low: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  degraded: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  unknown: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
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

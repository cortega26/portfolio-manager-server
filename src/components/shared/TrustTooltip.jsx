/**
 * src/components/shared/TrustTooltip.jsx
 *
 * SR-004 — Trust tooltip component.
 *
 * Wraps any content with a TrustBadge and renders a tooltip on hover
 * that explains the trust degradation reasons in human-readable form.
 *
 * Props:
 *   trust: TrustMetadata — the trust object from the API
 *   children: ReactNode  — the content to annotate (optional; badge-only if omitted)
 *   className?: string   — applied to the wrapper div
 */

import PropTypes from 'prop-types';
import { useState, useCallback } from 'react';
import { TrustBadge } from './TrustBadge.jsx';

const REASON_LABELS = {
  stale_price: 'Price data is stale',
  missing_price: 'Price data is unavailable',
  cache_only: 'Using cached data (live feed not available)',
  manual_override: 'User-entered value',
  partial_portfolio: 'Some holdings could not be priced',
  fx_conversion_risk: 'Currency conversion adds uncertainty',
  computed_estimate: 'Computed estimate, not an observed price',
  source_degraded: 'Upstream data source is degraded',
};

/**
 * @param {{ trust: import('../../types/trust').TrustMetadata, children?: import('react').ReactNode, className?: string }} props
 */
export function TrustTooltip({ trust, children, className = '' }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  if (!trust) return children ?? null;

  const reason = trust.degraded_reason
    ? (REASON_LABELS[trust.degraded_reason] ?? trust.degraded_reason)
    : null;
  const hasTooltipContent = !!reason || trust.as_of;

  return (
    <span
      className={`relative inline-flex items-center gap-1 ${className}`}
      onMouseEnter={hasTooltipContent ? open : undefined}
      onMouseLeave={hasTooltipContent ? close : undefined}
      onFocus={hasTooltipContent ? open : undefined}
      onBlur={hasTooltipContent ? close : undefined}
    >
      {children}
      <TrustBadge trust={trust} />

      {isOpen && hasTooltipContent && (
        <div
          role="tooltip"
          className="absolute bottom-full left-0 z-50 mb-1 min-w-max max-w-xs rounded-md bg-gray-800 px-3 py-2 text-xs text-white shadow-lg dark:bg-gray-900 dark:ring-1 dark:ring-white/10"
        >
          {trust.as_of && (
            <p className="mb-1 font-semibold">As of: {new Date(trust.as_of).toLocaleString()}</p>
          )}
          {reason && <p>{reason}</p>}
        </div>
      )}
    </span>
  );
}

TrustTooltip.propTypes = {
  trust: PropTypes.shape({
    confidence_state: PropTypes.oneOf(['high', 'medium', 'low', 'degraded', 'unknown']).isRequired,
    freshness_state: PropTypes.string.isRequired,
    source_type: PropTypes.string.isRequired,
    as_of: PropTypes.string,
    degraded_reason: PropTypes.string,
  }).isRequired,
  children: PropTypes.node,
  className: PropTypes.string,
};

export default TrustTooltip;

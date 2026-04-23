/**
 * shared/policy.js
 *
 * SR-060/061 — Portfolio policy schema and pure evaluator.
 *
 * A "policy" is a named set of rules for a portfolio. The evaluator is a
 * pure function: same inputs → same outputs, no side effects.
 *
 * @typedef {'trim' | 'add' | 'rebalance' | 'review' | 'hold'} RecommendationType
 * @typedef {'high' | 'medium' | 'low'} Severity
 *
 * @typedef {object} AllocationTarget
 * @property {string} ticker       - ticker symbol
 * @property {number} target_pct   - target weight (0–100)
 * @property {number} tolerance_pct - allowable deviation before rebalancing
 *
 * @typedef {object} Policy
 * @property {string} [portfolio_id]          - the portfolio this policy is for
 * @property {number} max_concentration_pct   - single holding cannot exceed this weight
 * @property {number} min_cash_pct            - minimum cash allocation
 * @property {number} max_cash_pct            - maximum cash allocation
 * @property {number} review_cadence_days     - days between recommended reviews
 * @property {number} rebalance_tolerance_pct - default tolerance for allocation drift
 * @property {AllocationTarget[]} allocation_targets - per-ticker target allocations
 *
 * @typedef {object} PolicyRecommendation
 * @property {string} id              - unique identifier for this recommendation
 * @property {RecommendationType} type
 * @property {string} ticker          - which holding the rec applies to
 * @property {Severity} severity
 * @property {string} rationale       - human-readable explanation
 * @property {Record<string, unknown>} evidence  - supporting data
 *
 * @typedef {object} Holding
 * @property {string} ticker
 * @property {number} weight          - decimal fraction (0–1) or percentage — see note below
 * @property {number} [shares]
 * @property {number} [currentValue_cents]
 * @property {boolean} [isCash]
 */

/**
 * Default policy values — safe, conservative defaults.
 *
 * @type {Policy}
 */
export const DEFAULT_POLICY = {
  portfolio_id: undefined,
  max_concentration_pct: 40,
  min_cash_pct: 5,
  max_cash_pct: 30,
  review_cadence_days: 90,
  rebalance_tolerance_pct: 10,
  allocation_targets: [],
};

// ── Pure evaluator ────────────────────────────────────────────────────────────

/**
 * Normalises a weight value to a percentage (0–100).
 * If the value is ≤ 1, assumes decimal fraction and multiplies by 100.
 *
 * @param {number} weight
 * @returns {number}
 */
function toPercent(weight) {
  return weight <= 1 ? weight * 100 : weight;
}

/**
 * Generates a stable ID for a recommendation from its key properties.
 *
 * @param {RecommendationType} type
 * @param {string} ticker
 * @param {string} reason
 * @returns {string}
 */
function makeRecId(type, ticker, reason) {
  return `${type}:${ticker}:${reason}`;
}

/**
 * Evaluates a portfolio policy against current holdings and returns a list
 * of actionable recommendations.
 *
 * @param {{ policy: Policy, holdings: Holding[] }} params
 * @returns {PolicyRecommendation[]}
 */
export function evaluatePolicy({ policy, holdings }) {
  if (!policy || !Array.isArray(holdings)) {
    return [];
  }

  const recs = [];

  // ── Compute total portfolio value for weight normalisation ────────────────
  const totalValue = holdings.reduce((sum, h) => sum + (h.currentValue_cents ?? 0), 0);

  // ── Normalise holdings to percentage weights ──────────────────────────────
  const holdingPcts = holdings.map((h) => {
    if (totalValue > 0 && h.currentValue_cents != null) {
      return { ...h, pct: (h.currentValue_cents / totalValue) * 100 };
    }
    return { ...h, pct: toPercent(h.weight ?? 0) };
  });

  // ── Rule 1: Concentration limit ───────────────────────────────────────────
  const { max_concentration_pct } = policy;
  // Tickers with explicit allocation targets are managed by Rule 3 instead.
  const targetedTickers = new Set((policy.allocation_targets ?? []).map((t) => t.ticker));
  for (const holding of holdingPcts) {
    if (holding.isCash) continue; // Cash is handled separately
    if (targetedTickers.has(holding.ticker)) continue; // managed by allocation drift rule
    if (holding.pct > max_concentration_pct) {
      recs.push({
        id: makeRecId('trim', holding.ticker, 'concentration'),
        type: 'trim',
        ticker: holding.ticker,
        severity: holding.pct > max_concentration_pct * 1.5 ? 'high' : 'medium',
        rationale: `${holding.ticker} is ${holding.pct.toFixed(1)}% of the portfolio, exceeding the ${max_concentration_pct}% concentration limit.`,
        evidence: {
          current_pct: +holding.pct.toFixed(2),
          max_pct: max_concentration_pct,
          excess_pct: +(holding.pct - max_concentration_pct).toFixed(2),
        },
      });
    }
  }

  // ── Rule 2: Cash range ────────────────────────────────────────────────────
  const cashHolding = holdingPcts.find((h) => h.isCash || h.ticker === 'CASH');
  const cashPct = cashHolding?.pct ?? 0;
  const { min_cash_pct, max_cash_pct } = policy;

  if (cashPct < min_cash_pct) {
    recs.push({
      id: makeRecId('add', 'CASH', 'cash_below_minimum'),
      type: 'add',
      ticker: 'CASH',
      severity: 'medium',
      rationale: `Cash position is ${cashPct.toFixed(1)}%, below the ${min_cash_pct}% minimum. Consider adding cash to maintain liquidity.`,
      evidence: {
        current_pct: +cashPct.toFixed(2),
        min_pct: min_cash_pct,
        shortfall_pct: +(min_cash_pct - cashPct).toFixed(2),
      },
    });
  } else if (cashPct > max_cash_pct) {
    recs.push({
      id: makeRecId('trim', 'CASH', 'cash_above_maximum'),
      type: 'trim',
      ticker: 'CASH',
      severity: 'low',
      rationale: `Cash position is ${cashPct.toFixed(1)}%, above the ${max_cash_pct}% maximum. Consider deploying excess cash.`,
      evidence: {
        current_pct: +cashPct.toFixed(2),
        max_pct: max_cash_pct,
        excess_pct: +(cashPct - max_cash_pct).toFixed(2),
      },
    });
  }

  // ── Rule 3: Allocation target drift ──────────────────────────────────────
  const { allocation_targets = [], rebalance_tolerance_pct } = policy;
  for (const target of allocation_targets) {
    const holding = holdingPcts.find((h) => h.ticker === target.ticker);
    const currentPct = holding?.pct ?? 0;
    const tolerance = target.tolerance_pct ?? rebalance_tolerance_pct ?? 10;
    const drift = currentPct - target.target_pct;

    if (Math.abs(drift) > tolerance) {
      const recType = drift > 0 ? 'trim' : 'rebalance';
      recs.push({
        id: makeRecId(recType, target.ticker, 'allocation_drift'),
        type: recType,
        ticker: target.ticker,
        severity: Math.abs(drift) > tolerance * 2 ? 'high' : 'medium',
        rationale: `${target.ticker} is ${currentPct.toFixed(1)}%, drifted ${Math.abs(drift).toFixed(1)}% from the ${target.target_pct}% target (tolerance: ±${tolerance}%).`,
        evidence: {
          current_pct: +currentPct.toFixed(2),
          target_pct: target.target_pct,
          tolerance_pct: tolerance,
          drift_pct: +drift.toFixed(2),
        },
      });
    }
  }

  return recs;
}

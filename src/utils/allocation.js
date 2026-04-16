/**
 * Asset attribution utilities.
 *
 * computeAssetContributions — calculates each open holding's contribution
 * to total portfolio return using the Brinson-style formula:
 *   contribution_pp = weight × individual_return
 *
 * where:
 *   weight           = holding_value / total_nav
 *   individual_return = (current_value - cost_basis) / cost_basis
 *   contribution_pp  = weight × individual_return  (expressed in pp, i.e. ×100 for display)
 *
 * Returns rows sorted by contribution descending.
 */

/**
 * @param {Array}  openHoldings   - array of holding objects: { ticker, shares, cost }
 * @param {Object} currentPrices  - map of ticker → price (number)
 * @param {number} cashBalance    - cash portion of NAV
 * @returns {Array<{
 *   ticker: string,
 *   value: number,
 *   cost: number,
 *   weight: number,
 *   individualReturn: number | null,
 *   contributionPp: number | null,
 * }>}
 */
export function computeAssetContributions(openHoldings, currentPrices, cashBalance) {
  if (!Array.isArray(openHoldings) || openHoldings.length === 0) {
    return [];
  }

  const cash = Number.isFinite(Number(cashBalance)) ? Number(cashBalance) : 0;

  const rows = openHoldings
    .map((holding) => {
      const ticker = holding?.ticker;
      if (!ticker) return null;

      const shares = Number(holding?.shares ?? 0);
      const cost = Number(holding?.cost ?? 0);
      const price = Number(currentPrices?.[ticker] ?? 0);

      if (!Number.isFinite(shares) || !Number.isFinite(price) || price <= 0) {
        return null;
      }

      const value = shares * price;
      if (value <= 0) return null;

      return { ticker, value, cost };
    })
    .filter(Boolean);

  const totalEquity = rows.reduce((sum, r) => sum + r.value, 0);
  const totalNav = totalEquity + Math.max(0, cash);

  if (totalNav <= 0) return [];

  return rows
    .map((r) => {
      const weight = r.value / totalNav;
      const individualReturn = r.cost > 0 ? (r.value - r.cost) / r.cost : null;
      const contributionPp = individualReturn !== null ? weight * individualReturn * 100 : null;

      return {
        ticker: r.ticker,
        value: r.value,
        cost: r.cost,
        weight,
        individualReturn,
        contributionPp,
      };
    })
    .sort((a, b) => {
      // nulls last, then descending
      if (a.contributionPp === null && b.contributionPp === null) return 0;
      if (a.contributionPp === null) return 1;
      if (b.contributionPp === null) return -1;
      return b.contributionPp - a.contributionPp;
    });
}

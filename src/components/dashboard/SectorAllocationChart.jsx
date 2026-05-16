import { useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

import { useI18n } from '../../i18n/I18nProvider.jsx';
import { computeSectorAllocationSlices } from '../../utils/sectors.js';

function SectorTooltip({ active, payload, formatCurrency }) {
  if (!active || !Array.isArray(payload) || payload.length === 0) {
    return null;
  }
  const entry = payload[0]?.payload;
  if (!entry) return null;

  return (
    <div className="rounded-xl border border-surface-200 bg-white px-3 py-2 shadow-elevated dark:border-surface-700 dark:bg-surface-800">
      <p className="text-sm font-semibold text-surface-800 dark:text-surface-100">{entry.sector}</p>
      <p className="text-xs text-surface-600 dark:text-surface-300">
        {formatCurrency(entry.value)} · {entry.percentage.toFixed(1)}%
      </p>
      {entry.tickers && entry.tickers.length > 0 && (
        <p className="text-xs text-surface-400 dark:text-surface-400 mt-0.5">
          {entry.tickers.join(', ')}
        </p>
      )}
    </div>
  );
}

export default function SectorAllocationChart({
  openHoldings = [],
  currentPrices = {},
  cashBalance = 0,
}) {
  const { t, formatCurrency } = useI18n();
  const { slices } = useMemo(
    () => computeSectorAllocationSlices(openHoldings, currentPrices, cashBalance),
    [openHoldings, currentPrices, cashBalance]
  );

  return (
    <div className="card-base p-5" data-testid="sector-allocation-chart">
      <h3 className="font-heading text-sm font-bold text-surface-700 dark:text-surface-300">
        {t('dashboard.sectors.title')}
      </h3>

      {slices.length === 0 ? (
        <p
          className="mt-4 text-sm text-surface-500 dark:text-surface-400"
          data-testid="sector-allocation-chart-empty"
        >
          {t('dashboard.sectors.empty')}
        </p>
      ) : (
        <div className="mt-4 h-64 w-full" data-testid="sector-allocation-chart-content">
          <ResponsiveContainer
            width="100%"
            height="100%"
            role="img"
            aria-label={t('dashboard.sectors.aria')}
          >
            <PieChart>
              <Pie
                data={slices}
                dataKey="value"
                nameKey="sector"
                cx="50%"
                cy="50%"
                innerRadius="40%"
                outerRadius="70%"
              >
                {slices.map((entry) => (
                  <Cell key={entry.sector} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<SectorTooltip formatCurrency={formatCurrency} />} />
              <Legend
                formatter={(value) => value}
                payload={slices.map((s) => ({
                  id: s.sector,
                  value: `${s.sector} ${s.percentage.toFixed(1)}%`,
                  color: s.color,
                }))}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export { computeSectorAllocationSlices };

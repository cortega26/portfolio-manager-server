// Pure formatting utilities and constants for the Dashboard.
// No JSX, no hooks. Safe to import in tests without a React tree.

import { ROI_PRIMARY_PERCENT_DIGITS } from '../../../shared/precision.js';

export const PORTFOLIO_COLOR = '#16a34a';
export const NAV_CONTRIBUTIONS_COLOR = '#6366f1';
export const NAV_MARKET_GAIN_COLOR = '#22c55e';

export const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export const FULL_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function formatShortDate(isoDate) {
  if (typeof isoDate !== 'string' || isoDate.length < 7) {
    return isoDate ?? '';
  }
  const month = Number(isoDate.slice(5, 7));
  const year = isoDate.slice(2, 4);
  if (month < 1 || month > 12) {
    return isoDate;
  }
  return `${SHORT_MONTHS[month - 1]} '${year}`;
}

export function formatFullDate(isoDate) {
  if (typeof isoDate !== 'string' || isoDate.length < 10) {
    return isoDate ?? '';
  }
  const month = Number(isoDate.slice(5, 7));
  const day = Number(isoDate.slice(8, 10));
  const year = isoDate.slice(0, 4);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return isoDate;
  }
  return `${FULL_MONTHS[month - 1]} ${day}, ${year}`;
}

export function formatDrawdownPeriod(peakDate, troughDate) {
  if (!peakDate || !troughDate) {
    return '';
  }
  const pMonth = Number(peakDate.slice(5, 7));
  const pYear = peakDate.slice(0, 4);
  const tMonth = Number(troughDate.slice(5, 7));
  const tYear = troughDate.slice(0, 4);
  if (pMonth < 1 || pMonth > 12 || tMonth < 1 || tMonth > 12) {
    return `${peakDate} – ${troughDate}`;
  }
  return `${SHORT_MONTHS[pMonth - 1]} ${pYear} – ${SHORT_MONTHS[tMonth - 1]} ${tYear}`;
}

export function formatNullableCurrency(formatCurrency, value) {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim().length > 0
        ? Number(value)
        : NaN;
  return Number.isFinite(numeric) ? formatCurrency(numeric) : '—';
}

export function formatNullablePercent(formatSignedPercent, value, fractionDigits = 1) {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim().length > 0
        ? Number(value)
        : NaN;
  return Number.isFinite(numeric) ? formatSignedPercent(numeric, fractionDigits) : '—';
}

export function toPercentPoints(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric * 100 : null;
}

export function formatInvestorMwrValue({ benchmarkSummary, t, formatSignedPercent }) {
  const portfolioMwrPct = toPercentPoints(benchmarkSummary?.portfolio);
  const formattedValue = formatNullablePercent(
    formatSignedPercent,
    portfolioMwrPct,
    ROI_PRIMARY_PERCENT_DIGITS
  );
  if (formattedValue === '—') {
    return formattedValue;
  }
  if (benchmarkSummary?.partial) {
    return formattedValue;
  }
  return t('dashboard.context.investorMwr.valueFull', {
    value: formattedValue,
  });
}

export function formatInvestorMwrDetail({ benchmarkSummary, t, formatSignedPercent, formatDate }) {
  const spyValue = formatNullablePercent(
    formatSignedPercent,
    toPercentPoints(benchmarkSummary?.benchmarks?.spy),
    ROI_PRIMARY_PERCENT_DIGITS
  );
  const qqqValue = formatNullablePercent(
    formatSignedPercent,
    toPercentPoints(benchmarkSummary?.benchmarks?.qqq),
    ROI_PRIMARY_PERCENT_DIGITS
  );

  if (benchmarkSummary?.partial && benchmarkSummary?.start_date) {
    return t('dashboard.context.investorMwr.detailPartial', {
      spy: spyValue,
      qqq: qqqValue,
      startDate: formatDate(`${benchmarkSummary.start_date}T00:00:00Z`),
    });
  }

  return t('dashboard.context.investorMwr.detail', {
    spy: spyValue,
    qqq: qqqValue,
  });
}

export function resolveInvestorMwrTone(benchmarkSummary) {
  const portfolio = Number(benchmarkSummary?.portfolio);
  const spy = Number(benchmarkSummary?.benchmarks?.spy);
  const qqq = Number(benchmarkSummary?.benchmarks?.qqq);
  if (!Number.isFinite(portfolio) || !Number.isFinite(spy) || !Number.isFinite(qqq)) {
    return 'default';
  }
  if (portfolio > spy && portfolio > qqq) {
    return 'positive';
  }
  if (portfolio < spy && portfolio < qqq) {
    return 'negative';
  }
  return 'default';
}

import { buildUsMarketHolidays } from '../../shared/marketCalendar.js';
import { toDateKey } from '../finance/cash.js';

const MS_PER_DAY = 86_400_000;

function toUtcDate(date) {
  const key = toDateKey(date);
  const parsed = new Date(`${key}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

export function isTradingDay(date) {
  const parsed = toUtcDate(date);
  if (!parsed) {
    return false;
  }
  const day = parsed.getUTCDay();
  if (day === 0 || day === 6) {
    return false;
  }
  const holidays = buildUsMarketHolidays(parsed.getUTCFullYear());
  return !holidays.has(toDateKey(parsed));
}

export function computeTradingDayAge(latestDate, referenceDate = new Date()) {
  const latest = toUtcDate(latestDate);
  const reference = toUtcDate(referenceDate);
  if (!latest || !reference) {
    return Number.POSITIVE_INFINITY;
  }
  if (reference.getTime() <= latest.getTime()) {
    return 0;
  }
  let tradingDays = 0;
  for (let ts = latest.getTime() + MS_PER_DAY; ts <= reference.getTime(); ts += MS_PER_DAY) {
    const current = new Date(ts);
    if (isTradingDay(current)) {
      tradingDays += 1;
    }
  }
  return tradingDays;
}

export function nextTradingDay(date) {
  let cursor = toUtcDate(date);
  if (!cursor) {
    return null;
  }
  do {
    cursor = new Date(cursor.getTime() + MS_PER_DAY);
  } while (!isTradingDay(cursor));
  return toDateKey(cursor);
}

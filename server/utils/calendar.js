import { toDateKey } from '../finance/cash.js';

const MS_PER_DAY = 86_400_000;

function nthWeekdayOfMonth(year, monthIndex, weekday, occurrence) {
  const firstOfMonth = new Date(Date.UTC(year, monthIndex, 1));
  const offset = (weekday - firstOfMonth.getUTCDay() + 7) % 7;
  const day = 1 + offset + (occurrence - 1) * 7;
  return new Date(Date.UTC(year, monthIndex, day));
}

function lastWeekdayOfMonth(year, monthIndex, weekday) {
  const lastOfMonth = new Date(Date.UTC(year, monthIndex + 1, 0));
  const offset = (lastOfMonth.getUTCDay() - weekday + 7) % 7;
  const day = lastOfMonth.getUTCDate() - offset;
  return new Date(Date.UTC(year, monthIndex, day));
}

function observedHoliday(year, monthIndex, dayOfMonth) {
  const date = new Date(Date.UTC(year, monthIndex, dayOfMonth));
  const day = date.getUTCDay();
  if (day === 0) {
    date.setUTCDate(date.getUTCDate() + 1);
  } else if (day === 6) {
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return date;
}

function computeWesternEaster(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

const holidayCache = new Map();

function buildUsMarketHolidays(year) {
  if (holidayCache.has(year)) {
    return holidayCache.get(year);
  }

  const holidays = new Set();

  const add = (date) => {
    holidays.add(toDateKey(date));
  };

  add(observedHoliday(year, 0, 1)); // New Year's Day
  add(nthWeekdayOfMonth(year, 0, 1, 3)); // Martin Luther King Jr. Day (3rd Monday Jan)
  add(nthWeekdayOfMonth(year, 1, 1, 3)); // Presidents' Day (3rd Monday Feb)

  const easter = computeWesternEaster(year);
  const goodFriday = new Date(easter.getTime() - 2 * MS_PER_DAY);
  add(goodFriday);

  add(lastWeekdayOfMonth(year, 4, 1)); // Memorial Day (last Monday May)
  if (year >= 2021) {
    add(observedHoliday(year, 5, 19)); // Juneteenth
  }
  add(observedHoliday(year, 6, 4)); // Independence Day
  add(nthWeekdayOfMonth(year, 8, 1, 1)); // Labor Day (1st Monday Sep)
  add(nthWeekdayOfMonth(year, 10, 4, 4)); // Thanksgiving (4th Thursday Nov)
  add(observedHoliday(year, 11, 25)); // Christmas Day

  holidayCache.set(year, holidays);
  return holidays;
}

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
  for (
    let ts = latest.getTime() + MS_PER_DAY;
    ts <= reference.getTime();
    ts += MS_PER_DAY
  ) {
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

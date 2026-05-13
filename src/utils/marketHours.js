import { buildUsMarketHolidays } from '../../shared/marketCalendar.js';

const WEEKDAY_INDEX = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

const MARKET_TIMEZONE = 'America/New_York';
const MARKET_OPEN_MINUTES = 9 * 60 + 30;
const MARKET_CLOSE_MINUTES = 16 * 60;
const EXTENDED_PRE_OPEN_MINUTES = 4 * 60;
const EXTENDED_POST_CLOSE_MINUTES = 20 * 60;

const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: MARKET_TIMEZONE,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

function getNewYorkDateParts(date) {
  const parts = {
    year: 0,
    month: 0,
    day: 0,
    hour: 0,
    minute: 0,
    weekday: 0,
  };
  for (const part of dateTimeFormatter.formatToParts(date)) {
    if (part.type === 'year') {
      parts.year = Number.parseInt(part.value, 10);
    } else if (part.type === 'month') {
      parts.month = Number.parseInt(part.value, 10);
    } else if (part.type === 'day') {
      parts.day = Number.parseInt(part.value, 10);
    } else if (part.type === 'hour') {
      parts.hour = Number.parseInt(part.value, 10);
    } else if (part.type === 'minute') {
      parts.minute = Number.parseInt(part.value, 10);
    } else if (part.type === 'weekday') {
      const key = part.value.toLowerCase().slice(0, 3);
      parts.weekday = WEEKDAY_INDEX[key] ?? 0;
    }
  }
  const month = String(parts.month).padStart(2, '0');
  const day = String(parts.day).padStart(2, '0');
  return {
    ...parts,
    dateKey: `${parts.year}-${month}-${day}`,
  };
}

function addDays(date, days) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function isWeekend(parts) {
  return parts.weekday === 0 || parts.weekday === 6;
}

function isHoliday(parts) {
  const set = buildUsMarketHolidays(parts.year);
  return set.has(parts.dateKey);
}

function isTradingDay(parts) {
  if (isWeekend(parts)) {
    return false;
  }
  return !isHoliday(parts);
}

function minutesFromMidnight(parts) {
  return parts.hour * 60 + parts.minute;
}

function stepTradingDay(referenceDate, direction) {
  let cursor = addDays(referenceDate, direction);
  for (let i = 0; i < 14; i += 1) {
    const parts = getNewYorkDateParts(cursor);
    if (isTradingDay(parts)) {
      return { date: cursor, parts };
    }
    cursor = addDays(cursor, direction);
  }
  return null;
}

export function getMarketClock(referenceDate = new Date()) {
  const now = new Date(referenceDate.getTime());
  const parts = getNewYorkDateParts(now);
  const tradingDay = isTradingDay(parts);
  const currentMinutes = minutesFromMidnight(parts);
  const isOpen =
    tradingDay && currentMinutes >= MARKET_OPEN_MINUTES && currentMinutes < MARKET_CLOSE_MINUTES;
  const isBeforeOpen = tradingDay && currentMinutes < MARKET_OPEN_MINUTES;
  const isAfterClose = tradingDay && currentMinutes >= MARKET_CLOSE_MINUTES;
  const isExtendedHours =
    tradingDay &&
    !isOpen &&
    ((currentMinutes >= EXTENDED_PRE_OPEN_MINUTES && currentMinutes < MARKET_OPEN_MINUTES) ||
      (currentMinutes >= MARKET_CLOSE_MINUTES && currentMinutes < EXTENDED_POST_CLOSE_MINUTES));
  const previousTrading = stepTradingDay(now, -1);
  const nextTrading = stepTradingDay(now, 1);

  const lastTradingDate = (() => {
    if (tradingDay && !isBeforeOpen) {
      return parts.dateKey;
    }
    return previousTrading?.parts.dateKey ?? parts.dateKey;
  })();

  const nextTradingDate = (() => {
    if (tradingDay && isBeforeOpen) {
      return parts.dateKey;
    }
    if (tradingDay && isOpen) {
      return parts.dateKey;
    }
    return nextTrading?.parts.dateKey ?? parts.dateKey;
  })();

  return {
    isOpen,
    isTradingDay: tradingDay,
    isHoliday: tradingDay ? false : !isWeekend(parts) && isHoliday(parts),
    isWeekend: isWeekend(parts),
    lastTradingDate,
    nextTradingDate,
    isBeforeOpen,
    isAfterClose,
    isExtendedHours,
  };
}

export function isMarketOpen(referenceDate = new Date()) {
  return getMarketClock(referenceDate).isOpen;
}

const WEEKDAY_INDEX = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

const MARKET_TIMEZONE = "America/New_York";
const MARKET_OPEN_MINUTES = 9 * 60 + 30;
const MARKET_CLOSE_MINUTES = 16 * 60;

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: MARKET_TIMEZONE,
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const holidayCache = new Map();

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
    if (part.type === "year") {
      parts.year = Number.parseInt(part.value, 10);
    } else if (part.type === "month") {
      parts.month = Number.parseInt(part.value, 10);
    } else if (part.type === "day") {
      parts.day = Number.parseInt(part.value, 10);
    } else if (part.type === "hour") {
      parts.hour = Number.parseInt(part.value, 10);
    } else if (part.type === "minute") {
      parts.minute = Number.parseInt(part.value, 10);
    } else if (part.type === "weekday") {
      const key = part.value.toLowerCase().slice(0, 3);
      parts.weekday = WEEKDAY_INDEX[key] ?? 0;
    }
  }
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  return {
    ...parts,
    dateKey: `${parts.year}-${month}-${day}`,
  };
}

function createUtcDate(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function nthWeekdayOfMonth(year, month, weekdayIndex, occurrence) {
  const first = createUtcDate(year, month, 1);
  const offset = (weekdayIndex - first.getUTCDay() + 7) % 7;
  const day = 1 + offset + (occurrence - 1) * 7;
  return createUtcDate(year, month, day);
}

function lastWeekdayOfMonth(year, month, weekdayIndex) {
  const last = new Date(Date.UTC(year, month, 0, 12, 0, 0));
  const diff = (last.getUTCDay() - weekdayIndex + 7) % 7;
  const day = last.getUTCDate() - diff;
  return createUtcDate(year, month, day);
}

function observedDate(year, month, day) {
  const date = createUtcDate(year, month, day);
  const weekday = date.getUTCDay();
  if (weekday === 0) {
    date.setUTCDate(date.getUTCDate() + 1);
  } else if (weekday === 6) {
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return date;
}

function addDays(date, days) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function computeEasterSunday(year) {
  // Anonymous Gregorian algorithm
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
  return createUtcDate(year, month, day);
}

function formatDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function computeMarketHolidays(year) {
  const holidays = new Set();
  holidays.add(formatDateKey(observedDate(year, 1, 1))); // New Year's Day
  holidays.add(formatDateKey(nthWeekdayOfMonth(year, 1, 1, 3))); // MLK Day (third Monday)
  holidays.add(formatDateKey(nthWeekdayOfMonth(year, 2, 1, 3))); // Presidents' Day (third Monday)
  const easter = computeEasterSunday(year);
  holidays.add(formatDateKey(addDays(easter, -2))); // Good Friday
  holidays.add(formatDateKey(lastWeekdayOfMonth(year, 5, 1))); // Memorial Day (last Monday)
  holidays.add(formatDateKey(observedDate(year, 6, 19))); // Juneteenth
  holidays.add(formatDateKey(observedDate(year, 7, 4))); // Independence Day
  holidays.add(formatDateKey(nthWeekdayOfMonth(year, 9, 1, 1))); // Labor Day (first Monday)
  holidays.add(formatDateKey(nthWeekdayOfMonth(year, 11, 4, 4))); // Thanksgiving (fourth Thursday)
  holidays.add(formatDateKey(observedDate(year, 12, 25))); // Christmas Day
  return holidays;
}

function getHolidaySet(year) {
  if (!holidayCache.has(year)) {
    holidayCache.set(year, computeMarketHolidays(year));
  }
  return holidayCache.get(year);
}

function isHoliday(parts) {
  const set = getHolidaySet(parts.year);
  return set.has(parts.dateKey);
}

function isWeekend(parts) {
  return parts.weekday === 0 || parts.weekday === 6;
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
  };
}

export function isMarketOpen(referenceDate = new Date()) {
  return getMarketClock(referenceDate).isOpen;
}


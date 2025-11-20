// @ts-nocheck
import { runDailyClose } from './daily_close.js';
import { isTradingDay } from '../utils/calendar.js';

const MS_PER_DAY = 86_400_000;

export function scheduleNightlyClose({ config, logger }) {
  const hour = config?.jobs?.nightlyHour ?? 1;
  const dataDir = config?.dataDir ?? './data';

  function computeDelayMs() {
    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(hour, 0, 0, 0);
    if (next <= now) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    return next.getTime() - now.getTime();
  }

  async function runAndSchedule() {
    try {
      const now = new Date();
      const target = new Date(now.getTime() - MS_PER_DAY);
      if (!isTradingDay(target)) {
        logger?.info?.('nightly_job_skipped_non_trading_day', {
          target_date: target.toISOString().slice(0, 10),
        });
      } else {
        await runDailyClose({ dataDir, logger, date: target, config });
      }
    } catch (error) {
      logger?.error?.('nightly_job_failed', { error: error.message });
    } finally {
      const delay = computeDelayMs();
      setTimeout(runAndSchedule, delay).unref?.();
    }
  }

  const initialDelay = computeDelayMs();
  setTimeout(runAndSchedule, initialDelay).unref?.();
}

export default scheduleNightlyClose;

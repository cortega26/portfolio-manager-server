import { runDailyClose } from './daily_close.js';
import { runInterestAccrual, previousTradingDay } from './interest.js';

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
      const target = previousTradingDay(now);
      await runInterestAccrual({ dataDir, logger, date: target, config });
      await runDailyClose({
        dataDir,
        logger,
        date: target,
        config,
        skipInterest: true,
      });
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

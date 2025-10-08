import { buildSyntheticLedger } from './syntheticLedger.js';
import { computeDailyStates } from '../../server/finance/portfolio.js';

const HOLDINGS_THRESHOLD_MS = 1_000;
const TARGET_TRANSACTION_COUNT = 12_288;

function emitLog(level, payload) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    ...payload,
  };
  console.log(JSON.stringify(entry));
}

function measureHoldingsBuilder({ transactions, pricesByDate, dates }) {
  const heapBefore = process.memoryUsage().heapUsed;
  const start = process.hrtime.bigint();
  const states = computeDailyStates({ transactions, pricesByDate, dates });
  const end = process.hrtime.bigint();
  const heapAfter = process.memoryUsage().heapUsed;

  if (!Array.isArray(states) || states.length !== dates.length) {
    throw new Error('holdings builder returned mismatched state history');
  }
  const lastState = states.at(-1);
  if (!lastState || typeof lastState.nav !== 'number' || Number.isNaN(lastState.nav)) {
    throw new Error('holdings builder produced invalid NAV metrics');
  }

  const durationMs = Number(end - start) / 1_000_000;
  const heapDeltaMb = Number(((heapAfter - heapBefore) / 1024 / 1024).toFixed(3));

  if (durationMs > HOLDINGS_THRESHOLD_MS) {
    throw new Error(
      `holdings builder exceeded ${HOLDINGS_THRESHOLD_MS}ms threshold (${durationMs.toFixed(2)}ms)`,
    );
  }

  return {
    durationMs: Number(durationMs.toFixed(2)),
    heapDeltaMb,
    navSample: Number(lastState.nav.toFixed(2)),
  };
}

function runHoldingsBuilderPerf() {
  const ledger = buildSyntheticLedger({ transactionCount: TARGET_TRANSACTION_COUNT });
  if (ledger.transactions.length - 1 < TARGET_TRANSACTION_COUNT) {
    throw new Error('synthetic ledger did not meet minimum transaction count');
  }

  // Warm-up pass to stabilize JIT before measurement.
  computeDailyStates(ledger);

  const metrics = measureHoldingsBuilder(ledger);
  emitLog('info', {
    event: 'perf_metric',
    metric: 'holdings_builder_duration',
    transactionCount: ledger.transactions.length,
    dateCount: ledger.dates.length,
    thresholdMs: HOLDINGS_THRESHOLD_MS,
    durationMs: metrics.durationMs,
    heapDeltaMb: metrics.heapDeltaMb,
    navSample: metrics.navSample,
  });
}

function main() {
  emitLog('info', { event: 'perf_suite_start', suite: 'p5-test-2' });
  try {
    runHoldingsBuilderPerf();
    emitLog('info', { event: 'perf_suite_complete', suite: 'p5-test-2', status: 'pass' });
  } catch (error) {
    emitLog('error', {
      event: 'perf_suite_complete',
      suite: 'p5-test-2',
      status: 'fail',
      message: error.message,
    });
    if (error?.stack) {
      emitLog('debug', {
        event: 'perf_error_stack',
        suite: 'p5-test-2',
        stack: error.stack,
      });
    }
    process.exitCode = 1;
  }
}

main();

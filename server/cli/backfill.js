#!/usr/bin/env node
import path from 'path';

import { runDailyClose } from '../jobs/daily_close.js';
import { loadConfig } from '../config.js';

const MS_PER_DAY = 86_400_000;

function parseArgs(argv) {
  const args = { from: null, to: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--from') {
      args.from = argv[i + 1];
      i += 1;
    } else if (arg === '--to') {
      args.to = argv[i + 1];
      i += 1;
    }
  }
  if (!args.from || !args.to) {
    throw new Error('Usage: backfill --from=YYYY-MM-DD --to=YYYY-MM-DD');
  }
  if (args.from > args.to) {
    throw new Error('`from` must be before or equal to `to`.');
  }
  return args;
}

function listDates(from, to) {
  const start = new Date(`${from}T00:00:00Z`).getTime();
  const end = new Date(`${to}T00:00:00Z`).getTime();
  const result = [];
  for (let ts = start; ts <= end; ts += MS_PER_DAY) {
    result.push(new Date(ts).toISOString().slice(0, 10));
  }
  return result;
}

async function main() {
  const [, , ...argv] = process.argv;
  const args = parseArgs(argv);
  const config = loadConfig();
  const dates = listDates(args.from, args.to);
  for (const date of dates) {
    await runDailyClose({
      dataDir: config.dataDir,
      logger: console,
      date: new Date(`${date}T00:00:00Z`),
    });
  }
  console.log(
    JSON.stringify({
      level: 'info',
      message: 'backfill_complete',
      processed_days: dates.length,
    }),
  );
}

if (import.meta.url === `file://${path.resolve(process.argv[1])}`) {
  main().catch((error) => {
    console.error(
      JSON.stringify({
        level: 'error',
        message: 'backfill_failed',
        error: error.message,
      }),
    );
    process.exitCode = 1;
  });
}

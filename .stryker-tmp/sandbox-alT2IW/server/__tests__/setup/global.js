// @ts-nocheck
import path from 'node:path';
import process from 'node:process';
import { inspect } from 'node:util';

import fc from 'fast-check';

function throwOnConsole(method) {
  const original = console[method].bind(console);
  console[method] = (...args) => {
    original(...args);
    const rendered = args.map((value) => (typeof value === 'string' ? value : inspect(value))).join(' ');
    throw new Error(`Console ${method}: ${rendered}`);
  };
}

throwOnConsole('warn');
throwOnConsole('error');

const PROJECT_SEGMENTS = ['server', 'src', 'shared'];

function isProjectWarning(warning) {
  if (!warning?.stack) {
    return false;
  }
  return PROJECT_SEGMENTS.some((segment) => warning.stack.includes(`${path.sep}${segment}${path.sep}`));
}

process.on('warning', (warning) => {
  if (!isProjectWarning(warning)) {
    return;
  }
  const error = new Error(`Warning treated as error: ${warning.name}: ${warning.message}`);
  error.cause = warning;
  throw error;
});

const seed = Number.parseInt(process.env.FC_SEED ?? process.env.TEST_RUN_SEED ?? '20251006', 10);
const numRuns = Number.parseInt(process.env.FC_RUNS ?? '80', 10);

fc.configureGlobal({ seed, numRuns, ignoreEqualValues: true });

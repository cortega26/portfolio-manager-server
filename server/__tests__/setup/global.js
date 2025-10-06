import path from 'node:path';
import process from 'node:process';

import fc from 'fast-check';

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

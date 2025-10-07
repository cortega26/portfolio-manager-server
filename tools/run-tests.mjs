#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const TEST_DIRS = ['server/__tests__', 'shared/__tests__', 'src/__tests__'];
const PROJECT_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const SETUP_MODULE = path.join(PROJECT_ROOT, 'server', '__tests__', 'setup', 'global.js');
const DEFAULT_SEED = 20251006;

function parseArgs(argv) {
  const options = { repeat: 1, coverage: true, ci: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--ci') {
      options.ci = true;
      continue;
    }
    if (arg === '--no-coverage') {
      options.coverage = false;
      continue;
    }
    if (arg === '--repeat') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('--repeat requires a value');
      }
      options.repeat = Number.parseInt(value, 10);
      if (!Number.isFinite(options.repeat) || options.repeat <= 0) {
        throw new Error('--repeat must be a positive integer');
      }
      i += 1;
      continue;
    }
    if (arg.startsWith('--repeat=')) {
      const value = arg.split('=')[1];
      options.repeat = Number.parseInt(value, 10);
      if (!Number.isFinite(options.repeat) || options.repeat <= 0) {
        throw new Error('--repeat must be a positive integer');
      }
      continue;
    }
  }
  return { options };
}

async function collectTestFiles() {
  const results = [];
  for (const relDir of TEST_DIRS) {
    const absDir = path.join(PROJECT_ROOT, relDir);
    try {
      await walk(absDir, relDir, results);
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        continue;
      }
      throw error;
    }
  }
  if (results.length === 0) {
    throw new Error('No test files were discovered.');
  }
  const invalid = results.filter((file) => typeof file !== 'string' || file.length === 0);
  if (invalid.length > 0) {
    throw new Error(`Discovered invalid test entries: ${invalid.join(', ')}`);
  }
  return results.sort();
}

async function walk(absDir, relDir, accumulator) {
  const entries = await readdir(absDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue;
    }
    if (entry.isDirectory()) {
      if (entry.name === 'fixtures' || entry.name === 'helpers' || entry.name === '__snapshots__') {
        // Skip non-test utility directories that are imported by tests.
        continue;
      }
      await walk(
        path.join(absDir, entry.name),
        path.join(relDir, entry.name),
        accumulator,
      );
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    if (/\.(test|spec)\.(c|m)?js$/u.test(entry.name)) {
      accumulator.push(path.join(relDir, entry.name));
    }
  }
}

function toSeed(value) {
  if (typeof value === 'number') {
    return value >>> 0;
  }
  if (typeof value === 'string' && value !== '') {
    const digest = crypto
      .createHash('sha256')
      .update(value)
      .digest();
    return digest.readUInt32LE(0);
  }
  return DEFAULT_SEED;
}

function shuffle(list, seed) {
  const array = [...list];
  let current = array.length;
  let k = seed >>> 0;
  while (current > 0) {
    k ^= k << 13;
    k ^= k >>> 17;
    k ^= k << 5;
    k >>>= 0;
    const randomIndex = k % current;
    current -= 1;
    const temp = array[current];
    array[current] = array[randomIndex];
    array[randomIndex] = temp;
  }
  return array;
}

function resolveC8Bin() {
  // Return the actual JS entry point for c8 so we can invoke it
  // with the node executable. Spawning the wrapper scripts
  // (c8 / c8.cmd) directly can cause spawn EINVAL inside
  // bash-like environments on Windows.
  return path.join(PROJECT_ROOT, 'node_modules', 'c8', 'bin', 'c8.js');
}

async function main() {
  const { options } = parseArgs(process.argv.slice(2));
  const files = await collectTestFiles();
  const baseSeed = toSeed(process.env.TEST_SHUFFLE_SEED ?? (options.ci ? String(DEFAULT_SEED) : ''));
  for (let runIndex = 0; runIndex < options.repeat; runIndex += 1) {
    const runSeed = (baseSeed + runIndex) >>> 0;
    const order = shuffle(files, runSeed);
    process.stdout.write(
      `\n[test-run ${runIndex + 1}/${options.repeat}] seed=${runSeed} fileCount=${order.length}\n`,
    );
    for (const [idx, file] of order.entries()) {
      process.stdout.write(`  ${idx + 1}. ${file}\n`);
    }
    const env = { ...process.env, TEST_RUN_SEED: String(runSeed), FC_SEED: String(runSeed) };
    const setupSpecifier = `./${path
      .relative(PROJECT_ROOT, SETUP_MODULE)
      .split(path.sep)
      .join('/')}`;
    const nodeArgs = ['--import', setupSpecifier, '--test', ...order];
    let command = process.execPath;
    let args = nodeArgs;
    if (options.coverage) {
      // Invoke c8 via the node executable to avoid executing
      // platform-specific wrappers directly.
      const c8Js = resolveC8Bin();
      command = process.execPath;
      args = [
        c8Js,
        '--reporter=text',
        '--reporter=lcov',
        '--check-coverage',
        '--branches=70',
        '--functions=90',
        '--lines=90',
        '--statements=90',
        process.execPath,
        ...nodeArgs,
      ];
    }
    await new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: PROJECT_ROOT,
        env,
        stdio: 'inherit',
      });
      child.on('exit', (code, signal) => {
        if (code === 0) {
          resolve();
          return;
        }
        const message = signal
          ? `Test run terminated by signal ${signal}`
          : `Test run exited with code ${code}`;
        reject(new Error(message));
      });
      child.on('error', (error) => {
        reject(error);
      });
    });
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});

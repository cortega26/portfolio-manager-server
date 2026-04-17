#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const PROJECT_ROOT = process.cwd();
const DOCS_TO_CHECK = [
  'AGENTS.md',
  'AGENTS_QUICKSTART.md',
  'README.md',
  'SETUP.md',
  'context/CONSTRAINTS.md',
  'context/KNOWN_INVARIANTS.md',
  'context/ARCHITECTURE.md',
  'context/MODULE_INDEX.md',
  'context/TASK_ENTRYPOINTS.md',
  'docs/README.md',
  'docs/adr/README.md',
  'docs/reference/QUALITY_GATES.md',
  'docs/reference/VALIDATION_MATRIX.md',
  'docs/operations/playbooks/testing-strategy.md',
];
const ROOT_LEVEL_PATHS = new Set([
  '.env.example',
  '.nvmrc',
  'AGENTS.md',
  'AGENTS_QUICKSTART.md',
  'README.md',
  'SETUP.md',
  'eslint.config.js',
  'package.json',
  'playwright.config.ts',
  'postcss.config.js',
  'stryker.conf.json',
  'tailwind.config.js',
  'tsconfig.json',
  'tsconfig.typecheck.json',
  'vite.config.js',
  'vitest.config.ts',
]);
const TOP_LEVEL_PATHS = new Set([
  '.github',
  'context',
  'data',
  'docs',
  'electron',
  'public',
  'scripts',
  'server',
  'shared',
  'src',
  'tests',
  'tools',
]);
const COMMAND_PREFIXES = [
  'npm ',
  'npx ',
  'node ',
  'cp ',
  'git ',
  'xvfb-run ',
  'cross-env ',
  'PORT=',
  'NO_NETWORK_TESTS=',
];

function normalizeLinkTarget(target, docPath) {
  const cleaned = target.trim().replace(/^<|>$/g, '');
  if (
    !cleaned ||
    cleaned.startsWith('#') ||
    cleaned.includes('://') ||
    cleaned.startsWith('mailto:')
  ) {
    return null;
  }

  const withoutFragment = cleaned.split('#')[0].split('?')[0];
  if (!withoutFragment || withoutFragment.includes('*')) {
    return null;
  }

  return path.resolve(path.dirname(path.join(PROJECT_ROOT, docPath)), withoutFragment);
}

function looksLikeRepoPath(candidate) {
  if (!candidate || candidate.includes('\n') || candidate.includes('*')) {
    return false;
  }

  if (COMMAND_PREFIXES.some((prefix) => candidate.startsWith(prefix))) {
    return false;
  }

  if (candidate.includes(' ')) {
    return false;
  }

  if (candidate.includes('/')) {
    const normalized = candidate.replace(/\/$/u, '').replace(/^\.\//u, '');
    const firstSegment = normalized.split('/')[0];
    return TOP_LEVEL_PATHS.has(firstSegment);
  }

  return ROOT_LEVEL_PATHS.has(candidate);
}

function normalizeInlinePath(candidate) {
  if (!looksLikeRepoPath(candidate)) {
    return null;
  }

  return path.resolve(PROJECT_ROOT, candidate.replace(/\/$/u, ''));
}

async function pathExists(absolutePath) {
  try {
    await fs.access(absolutePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const problems = [];

  for (const relativeDocPath of DOCS_TO_CHECK) {
    const absoluteDocPath = path.join(PROJECT_ROOT, relativeDocPath);
    let text;

    try {
      text = await fs.readFile(absoluteDocPath, 'utf8');
    } catch {
      problems.push(`${relativeDocPath}: missing doc to validate`);
      continue;
    }

    const seen = new Set();

    for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const target = match[1];
      const resolved = normalizeLinkTarget(target, relativeDocPath);
      if (!resolved) {
        continue;
      }

      const key = `${relativeDocPath}::link::${resolved}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      if (!(await pathExists(resolved))) {
        problems.push(`${relativeDocPath}: markdown link points to missing path "${target}"`);
      }
    }

    for (const match of text.matchAll(/`([^`\n]+)`/g)) {
      const candidate = match[1].trim();
      const resolved = normalizeInlinePath(candidate);
      if (!resolved) {
        continue;
      }

      const key = `${relativeDocPath}::inline::${resolved}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      if (!(await pathExists(resolved))) {
        problems.push(`${relativeDocPath}: inline path reference is missing "${candidate}"`);
      }
    }
  }

  if (problems.length > 0) {
    process.stderr.write('Documentation path check failed.\n\n');
    for (const problem of problems) {
      process.stderr.write(`- ${problem}\n`);
    }
    process.exitCode = 1;
    return;
  }

  process.stdout.write('Documentation path check passed.\n');
}

await main();

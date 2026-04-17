#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const PROJECT_ROOT = process.cwd();
const REQUIRED_NODE = '20.19.0';

function parseVersion(version) {
  return String(version)
    .trim()
    .replace(/^v/, '')
    .split('.')
    .map((part) => Number.parseInt(part, 10));
}

function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = a[index] ?? 0;
    const rightPart = b[index] ?? 0;
    if (leftPart > rightPart) {
      return 1;
    }
    if (leftPart < rightPart) {
      return -1;
    }
  }
  return 0;
}

function exists(relativePath) {
  return fs.existsSync(path.join(PROJECT_ROOT, relativePath));
}

function readNvmrc() {
  const nvmrcPath = path.join(PROJECT_ROOT, '.nvmrc');
  if (!fs.existsSync(nvmrcPath)) {
    return null;
  }
  return fs.readFileSync(nvmrcPath, 'utf8').trim();
}

const checks = [
  {
    label: `Node >= ${REQUIRED_NODE}`,
    ok: compareVersions(process.versions.node, REQUIRED_NODE) >= 0,
    details: `found ${process.versions.node}`,
  },
  {
    label: '.nvmrc present',
    ok: exists('.nvmrc'),
    details: readNvmrc() ? `pins ${readNvmrc()}` : 'missing',
  },
  {
    label: '.env.example present',
    ok: exists('.env.example'),
  },
  {
    label: 'package-lock.json present',
    ok: exists('package-lock.json'),
  },
  {
    label: 'agent docs present',
    ok: exists('AGENTS.md') && exists('AGENTS_QUICKSTART.md'),
  },
  {
    label: 'context docs present',
    ok:
      exists('context/CONSTRAINTS.md') &&
      exists('context/KNOWN_INVARIANTS.md') &&
      exists('context/ARCHITECTURE.md') &&
      exists('context/MODULE_INDEX.md'),
  },
  {
    label: 'desktop entrypoints present',
    ok: exists('electron/main.cjs') && exists('electron/preload.cjs'),
  },
  {
    label: 'backend entrypoints present',
    ok: exists('server/index.js') && exists('server/app.js'),
  },
  {
    label: 'renderer entrypoints present',
    ok: exists('src/App.jsx') && exists('src/PortfolioManagerApp.jsx'),
  },
  {
    label: 'bootstrap scripts present',
    ok: exists('scripts/import-csv-portfolio.mjs') && exists('tools/run-tests.mjs'),
  },
  {
    label: 'canonical CSV import seeds present',
    ok:
      exists('32996_asset_market_buys.csv') &&
      exists('32996_asset_market_sells.csv') &&
      exists('32996_forex_buys.csv'),
  },
  {
    label: 'ADR index present',
    ok: exists('docs/adr/README.md'),
  },
];

let failures = 0;

process.stdout.write('Portfolio Manager Unified doctor\n\n');
for (const check of checks) {
  const status = check.ok ? 'PASS' : 'FAIL';
  const suffix = check.details ? ` (${check.details})` : '';
  process.stdout.write(`${status}  ${check.label}${suffix}\n`);
  if (!check.ok) {
    failures += 1;
  }
}

process.stdout.write('\nNext steps\n');
process.stdout.write('- npm ci\n');
process.stdout.write('- npm run verify:docs\n');
process.stdout.write('- npm run lint\n');
process.stdout.write('- npm test\n');

if (failures > 0) {
  process.stdout.write(`\nDoctor found ${failures} failing check(s).\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('\nDoctor passed.\n');
}

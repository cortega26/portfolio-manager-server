#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const PROJECT_ROOT = process.cwd();
const ACTIVE_DOCS = [
  'README.md',
  'SETUP.md',
  'AGENTS_QUICKSTART.md',
  'docs/README.md',
  'docs/reference/QUALITY_GATES.md',
  'docs/reference/VALIDATION_MATRIX.md',
  'docs/operations/playbooks/testing-strategy.md',
  'docs/adr/README.md',
];

const FORBIDDEN_PHRASES = [
  {
    phrase: 'better-sqlite3',
    reason: 'storage is implemented through sql.js-backed JsonTableStorage in the current repo.',
  },
  {
    phrase: 'tools/node-v20.19.0-linux-x64',
    reason: 'the repo no longer ships a bundled local Node runtime at that path.',
  },
];

async function loadPackageScripts() {
  const packageJsonPath = path.join(PROJECT_ROOT, 'package.json');
  const raw = await fs.readFile(packageJsonPath, 'utf8');
  const parsed = JSON.parse(raw);
  return new Set(Object.keys(parsed.scripts ?? {}));
}

async function readText(relativeDocPath) {
  return fs.readFile(path.join(PROJECT_ROOT, relativeDocPath), 'utf8');
}

function findMissingScripts(text, availableScripts) {
  const pattern = /\bnpm run ([A-Za-z0-9:_-]+)/g;
  const missing = [];
  for (const match of text.matchAll(pattern)) {
    const scriptName = match[1];
    if (!availableScripts.has(scriptName)) {
      missing.push(scriptName);
    }
  }
  return Array.from(new Set(missing));
}

function findForbiddenPhrases(text) {
  return FORBIDDEN_PHRASES.filter(({ phrase }) => text.includes(phrase));
}

async function checkAdrIndex() {
  const adrDir = path.join(PROJECT_ROOT, 'docs/adr');
  const adrIndexPath = path.join(adrDir, 'README.md');
  const [entries, indexText] = await Promise.all([
    fs.readdir(adrDir),
    fs.readFile(adrIndexPath, 'utf8'),
  ]);
  const adrFiles = entries
    .filter((entry) => /^\d{3}-.*\.md$/u.test(entry) && entry !== '000-template.md')
    .sort();

  return adrFiles.filter((entry) => !indexText.includes(entry));
}

async function main() {
  const availableScripts = await loadPackageScripts();
  const problems = [];

  for (const relativeDocPath of ACTIVE_DOCS) {
    const absoluteDocPath = path.join(PROJECT_ROOT, relativeDocPath);
    let text;
    try {
      text = await readText(relativeDocPath);
    } catch {
      problems.push(`Missing active doc: ${path.relative(PROJECT_ROOT, absoluteDocPath)}`);
      continue;
    }

    const missingScripts = findMissingScripts(text, availableScripts);
    for (const scriptName of missingScripts) {
      problems.push(`${relativeDocPath}: references missing npm script "${scriptName}"`);
    }

    const forbiddenMatches = findForbiddenPhrases(text);
    for (const match of forbiddenMatches) {
      problems.push(
        `${relativeDocPath}: contains forbidden phrase "${match.phrase}" (${match.reason})`
      );
    }
  }

  const missingAdrsInIndex = await checkAdrIndex();
  for (const entry of missingAdrsInIndex) {
    problems.push(`docs/adr/README.md: ADR index is missing "${entry}"`);
  }

  if (problems.length > 0) {
    process.stderr.write('Documentation contract check failed.\n\n');
    for (const problem of problems) {
      process.stderr.write(`- ${problem}\n`);
    }
    process.exitCode = 1;
    return;
  }

  process.stdout.write('Documentation contract check passed.\n');
}

await main();

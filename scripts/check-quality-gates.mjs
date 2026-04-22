#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const PROJECT_ROOT = process.cwd();
const QUALITY_GATES_DOC = 'docs/reference/QUALITY_GATES.md';
const CI_WORKFLOW = '.github/workflows/ci.yml';
const REQUIRED_SCRIPTS = [
  'codacy:analyze',
  'check:complexity',
  'doctor',
  'docs:check',
  'quality:gates',
  'verify:docs',
  'verify:quality',
  'verify:smoke',
  'verify:lint',
  'verify:typecheck',
  'format:check',
  'verify:build',
  'smoke:test',
  'test',
  'test:coverage',
];
const REQUIRED_CI_COMMANDS = [
  'npm run verify:docs',
  'npm run verify:quality',
  'npm run verify:smoke',
  'npm run test:coverage',
];

async function readText(relativePath) {
  return fs.readFile(path.join(PROJECT_ROOT, relativePath), 'utf8');
}

async function readPackageScripts() {
  const packageJson = JSON.parse(await readText('package.json'));
  return packageJson.scripts ?? {};
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

async function main() {
  const problems = [];
  const scripts = await readPackageScripts();
  const scriptNames = new Set(Object.keys(scripts));

  for (const requiredScript of REQUIRED_SCRIPTS) {
    if (!scriptNames.has(requiredScript)) {
      problems.push(`package.json: missing required script "${requiredScript}"`);
    }
  }

  let qualityGatesText = '';
  try {
    qualityGatesText = await readText(QUALITY_GATES_DOC);
  } catch {
    problems.push(`Missing quality-gates doc: ${QUALITY_GATES_DOC}`);
  }

  if (qualityGatesText) {
    const missingScripts = findMissingScripts(qualityGatesText, scriptNames);
    for (const scriptName of missingScripts) {
      problems.push(`${QUALITY_GATES_DOC}: references missing npm script "${scriptName}"`);
    }
  }

  const verifyDocsScript = scripts['verify:docs'] ?? '';
  if (!verifyDocsScript.includes('npm run quality:gates')) {
    problems.push('package.json: verify:docs must include "npm run quality:gates"');
  }

  let workflowText = '';
  try {
    workflowText = await readText(CI_WORKFLOW);
  } catch {
    problems.push(`Missing CI workflow: ${CI_WORKFLOW}`);
  }

  if (workflowText) {
    for (const command of REQUIRED_CI_COMMANDS) {
      if (!workflowText.includes(command)) {
        problems.push(`${CI_WORKFLOW}: missing required command "${command}"`);
      }
    }
  }

  if (problems.length > 0) {
    process.stderr.write('Quality gate contract check failed.\n\n');
    for (const problem of problems) {
      process.stderr.write(`- ${problem}\n`);
    }
    process.exitCode = 1;
    return;
  }

  process.stdout.write('Quality gate contract check passed.\n');
}

await main();

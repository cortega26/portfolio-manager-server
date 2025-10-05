#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const [, , command, ...rawArgs] = process.argv;

const options = {
  reportFormat: 'text',
  redact: false,
};

for (let i = 0; i < rawArgs.length; i += 1) {
  const arg = rawArgs[i];
  if (arg === '--report-format' && rawArgs[i + 1]) {
    options.reportFormat = rawArgs[i + 1];
    i += 1;
  } else if (arg === '--redact') {
    options.redact = true;
  }
}

if (command && command !== 'detect') {
  process.stderr.write(`Unsupported gitleaks command: ${command}\n`);
  process.exit(1);
}

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const IGNORE_DIRS = new Set(['.git', 'node_modules', 'coverage', 'dist', '.nyc_output', '.cache', 'bin']);
const MAX_FILE_SIZE_BYTES = 1024 * 1024;

const PATTERNS = [
  { id: 'aws-access-key', regex: /AKIA[0-9A-Z]{16}/g },
  { id: 'aws-secret-key', regex: /aws(.{0,20})?['\"][0-9a-zA-Z\/+]{40}['\"]/gi },
  { id: 'github-token', regex: /(ghp|gho|ghu|ghs|ghr)_[0-9A-Za-z]{36}/g },
  { id: 'slack-token', regex: /xox[baprs]-[0-9A-Za-z-]{10,48}/g },
  { id: 'google-api-key', regex: /AIza[0-9A-Za-z\-_]{35}/g },
  { id: 'private-key-block', regex: /-----BEGIN (?:RSA|EC|DSA|OPENSSH|PGP) PRIVATE KEY-----/g },
];

async function collectFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) {
      continue;
    }
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function findMatches(content, pattern) {
  const matches = [];
  pattern.regex.lastIndex = 0;
  let result;
  while ((result = pattern.regex.exec(content)) !== null) {
    const preceding = content.slice(0, result.index);
    const line = preceding.split(/\n/).length;
    matches.push({ match: result[0], line });
    if (!pattern.regex.global) {
      break;
    }
  }
  return matches;
}

async function scanFile(filePath) {
  const stats = await fs.stat(filePath);
  if (!stats.isFile() || stats.size > MAX_FILE_SIZE_BYTES) {
    return [];
  }

  let content;
  try {
    content = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    return [];
  }

  const findings = [];
  for (const pattern of PATTERNS) {
    for (const match of findMatches(content, pattern)) {
      findings.push({
        rule: pattern.id,
        match: options.redact ? '<redacted>' : match.match,
        file: relative(repoRoot, filePath),
        line: match.line,
      });
    }
  }
  return findings;
}

async function detect() {
  const files = await collectFiles(repoRoot);
  const leaks = [];
  for (const file of files) {
    const fileFindings = await scanFile(file);
    leaks.push(...fileFindings);
  }

  if (options.reportFormat === 'json') {
    process.stdout.write(`${JSON.stringify({ leaks }, null, 2)}\n`);
  } else {
    if (leaks.length === 0) {
      process.stdout.write('No leaks detected.\n');
    } else {
      for (const leak of leaks) {
        process.stdout.write(`Leak [${leak.rule}] ${leak.file}:${leak.line} -> ${leak.match}\n`);
      }
    }
  }

  process.exit(leaks.length === 0 ? 0 : 1);
}

if (!command || command === 'detect') {
  detect().catch((error) => {
    process.stderr.write(`gitleaks scan failed: ${error.message}\n`);
    process.exit(1);
  });
} else {
  process.stderr.write(`Unsupported gitleaks invocation.\n`);
  process.exit(1);
}

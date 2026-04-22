import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const PROJECT_ROOT = process.cwd();
export const QUALITY_REPORT_DIR = path.join(PROJECT_ROOT, 'reports', 'quality');
export const PRODUCTION_PREFIXES = ['server/', 'src/', 'electron/', 'shared/'];
export const CODE_PATH_PATTERN = /\.(?:[cm]?[jt]sx?)$/u;
const TEST_SEGMENT_PATTERN = /(^|\/)(__tests__|tests?|fixtures?|mocks?)(\/|$)/u;
const TEST_FILENAME_PATTERN = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;

export function normalizePath(value) {
  return String(value).replace(/\\/gu, '/').replace(/^\.\//u, '');
}

export function isProductionPath(relativePath) {
  const normalized = normalizePath(relativePath);
  return (
    PRODUCTION_PREFIXES.some((prefix) => normalized.startsWith(prefix)) &&
    !TEST_SEGMENT_PATTERN.test(normalized) &&
    !TEST_FILENAME_PATTERN.test(normalized)
  );
}

export function isProductionCodePath(relativePath) {
  return isProductionPath(relativePath) && CODE_PATH_PATTERN.test(relativePath);
}

export async function ensureQualityReportDir() {
  await fs.mkdir(QUALITY_REPORT_DIR, { recursive: true });
}

export async function runCommand(command, args, { allowFailure = false } = {}) {
  try {
    return await execFileAsync(command, args, {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (error) {
    if (allowFailure) {
      return {
        stdout: error.stdout ?? '',
        stderr: error.stderr ?? '',
        code: error.code ?? 1,
      };
    }
    throw error;
  }
}

export async function collectTouchedFiles() {
  const modified = await runCommand('git', [
    'diff',
    '--name-only',
    '--diff-filter=ACMRTUXB',
    'HEAD',
    '--',
  ]);
  const untracked = await runCommand('git', ['ls-files', '--others', '--exclude-standard']);
  return Array.from(
    new Set(
      `${modified.stdout}\n${untracked.stdout}`
        .split('\n')
        .map((entry) => normalizePath(entry.trim()))
        .filter(Boolean)
    )
  ).sort();
}

export async function listKnownRepoFiles() {
  const tracked = await runCommand('git', ['ls-files']);
  const touched = await collectTouchedFiles();
  return Array.from(
    new Set(
      `${tracked.stdout}\n${touched.join('\n')}`
        .split('\n')
        .map((entry) => normalizePath(entry.trim()))
        .filter(Boolean)
    )
  ).sort();
}

export function normalizeSarifPath(uri, knownFiles) {
  const normalized = normalizePath(uri);
  if (!normalized) {
    return '';
  }
  if (knownFiles.has(normalized)) {
    return normalized;
  }
  const basenameMatches = Array.from(knownFiles).filter(
    (candidate) => path.basename(candidate) === path.basename(normalized)
  );
  if (basenameMatches.length === 1) {
    return basenameMatches[0];
  }
  return normalized;
}

export async function readJson(relativePath, fallback = null) {
  try {
    const raw = await fs.readFile(path.join(PROJECT_ROOT, relativePath), 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export async function writeJsonReport(filename, payload) {
  await ensureQualityReportDir();
  const targetPath = path.join(QUALITY_REPORT_DIR, filename);
  await fs.writeFile(targetPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return targetPath;
}

export function createCountMap(groups, keyBuilder) {
  const counts = new Map();
  for (const group of groups ?? []) {
    const key = keyBuilder(group);
    const nextCount = Number(group.count ?? 1);
    counts.set(key, (counts.get(key) ?? 0) + nextCount);
  }
  return counts;
}

export function compareCountMaps(currentGroups, baselineGroups, keyBuilder) {
  const baselineCounts = createCountMap(baselineGroups, keyBuilder);
  const currentCounts = createCountMap(currentGroups, keyBuilder);
  const drift = [];

  for (const group of currentGroups) {
    const key = keyBuilder(group);
    const currentCount = currentCounts.get(key) ?? 0;
    const baselineCount = baselineCounts.get(key) ?? 0;
    if (currentCount > baselineCount) {
      drift.push({
        ...group,
        count: currentCount,
        baselineCount,
      });
    }
  }

  return drift;
}

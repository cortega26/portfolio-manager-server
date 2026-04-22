#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  PROJECT_ROOT,
  QUALITY_REPORT_DIR,
  compareCountMaps,
  collectTouchedFiles,
  ensureQualityReportDir,
  isProductionPath,
  listKnownRepoFiles,
  normalizeSarifPath,
  readJson,
  runCommand,
  writeJsonReport,
} from './lib/qualityGuardUtils.mjs';

const ALLOWLIST_PATH = '.codacy/allowlist.json';
const BASELINE_PATH = '.quality/codacy-baseline.json';
const SARIF_PATH = path.join(QUALITY_REPORT_DIR, 'codacy.sarif');
const LOG_PATH = path.join(QUALITY_REPORT_DIR, 'codacy.log');

function buildResultKey(result) {
  return [result.tool, result.path, result.ruleId, result.level].join('::');
}

function buildNotificationKey(notification) {
  return [notification.tool, notification.descriptorId, notification.level].join('::');
}

function allowlistedResult(result, allowlist) {
  return (allowlist.results ?? []).some((entry) => {
    return (
      (!entry.tool || entry.tool === result.tool) &&
      (!entry.ruleId || entry.ruleId === result.ruleId) &&
      (!entry.level || entry.level === result.level) &&
      (!entry.path || entry.path === result.path)
    );
  });
}

function allowlistedNotification(notification, allowlist) {
  return (allowlist.notifications ?? []).some((entry) => {
    return (
      (!entry.tool || entry.tool === notification.tool) &&
      (!entry.level || entry.level === notification.level) &&
      (!entry.descriptorId || entry.descriptorId === notification.descriptorId) &&
      (!entry.messageIncludes || notification.message.includes(entry.messageIncludes))
    );
  });
}

function flattenSarif(data, knownFiles) {
  const results = [];
  const notifications = [];

  for (const run of data.runs ?? []) {
    const tool = run.tool?.driver?.name ?? 'unknown';
    for (const result of run.results ?? []) {
      const location = result.locations?.[0]?.physicalLocation ?? {};
      const uri = location.artifactLocation?.uri ?? '';
      const startLine = location.region?.startLine ?? null;
      results.push({
        tool,
        ruleId: result.ruleId ?? 'UNKNOWN_RULE',
        level: result.level ?? 'warning',
        path: normalizeSarifPath(uri, knownFiles),
        startLine,
        message: result.message?.text ?? '',
      });
    }
    for (const invocation of run.invocations ?? []) {
      for (const notification of invocation.toolExecutionNotifications ?? []) {
        notifications.push({
          tool,
          descriptorId: notification.descriptor?.id ?? 'UNKNOWN_NOTIFICATION',
          level: notification.level ?? 'warning',
          message: notification.message?.text ?? '',
        });
      }
    }
  }

  return { results, notifications };
}

async function main() {
  await ensureQualityReportDir();

  const codacyRun = await runCommand(
    'bash',
    ['.codacy/cli.sh', 'analyze', '.', '--format', 'sarif', '-o', SARIF_PATH],
    { allowFailure: true }
  );
  await fs.writeFile(LOG_PATH, `${codacyRun.stdout ?? ''}${codacyRun.stderr ?? ''}`, 'utf8');

  if (codacyRun.code && codacyRun.code !== 0) {
    process.stderr.write('Codacy analyze command failed.\n');
    process.stderr.write(`See ${path.relative(PROJECT_ROOT, LOG_PATH)} for details.\n`);
    process.exitCode = codacyRun.code;
    return;
  }

  const [sarifRaw, allowlist, baseline, touchedFiles, knownFiles] = await Promise.all([
    fs.readFile(SARIF_PATH, 'utf8'),
    readJson(ALLOWLIST_PATH, { results: [], notifications: [] }),
    readJson(BASELINE_PATH, { results: [], notifications: [] }),
    collectTouchedFiles(),
    listKnownRepoFiles(),
  ]);
  const knownFilesSet = new Set(knownFiles);
  const touchedProductionFiles = touchedFiles.filter(isProductionPath);

  const flattened = flattenSarif(JSON.parse(sarifRaw), knownFilesSet);
  const unresolvedResults = flattened.results.filter(
    (result) => !allowlistedResult(result, allowlist)
  );
  const unresolvedNotifications = flattened.notifications.filter(
    (notification) => !allowlistedNotification(notification, allowlist)
  );

  const unresolvedProductionErrors = unresolvedResults.filter(
    (result) => isProductionPath(result.path) && result.level.toLowerCase() === 'error'
  );
  const unresolvedTouchedProductionFindings = unresolvedResults.filter(
    (result) =>
      touchedProductionFiles.includes(result.path) &&
      ['warning', 'error'].includes(result.level.toLowerCase())
  );
  const unresolvedTouchedNotifications = unresolvedNotifications.filter((notification) =>
    touchedProductionFiles.some((filePath) => notification.message.includes(filePath))
  );
  const touchedProductionDrift = compareCountMaps(
    unresolvedTouchedProductionFindings.map((result) => ({ ...result, count: 1 })),
    baseline.results ?? [],
    buildResultKey
  );
  const touchedNotificationDrift = compareCountMaps(
    unresolvedTouchedNotifications.map((notification) => ({ ...notification, count: 1 })),
    baseline.notifications ?? [],
    buildNotificationKey
  );

  const summary = {
    generatedAt: new Date().toISOString(),
    touchedProductionFiles,
    totals: {
      results: flattened.results.length,
      notifications: flattened.notifications.length,
      unresolvedResults: unresolvedResults.length,
      unresolvedNotifications: unresolvedNotifications.length,
    },
    unresolvedProductionErrors,
    touchedProductionDrift,
    touchedNotificationDrift,
  };

  await writeJsonReport('codacy-summary.json', summary);

  if (
    unresolvedProductionErrors.length > 0 ||
    touchedProductionDrift.length > 0 ||
    touchedNotificationDrift.length > 0
  ) {
    process.stderr.write('Codacy guard failed.\n');
    if (unresolvedProductionErrors.length > 0) {
      process.stderr.write('\nUnresolved production errors:\n');
      for (const result of unresolvedProductionErrors) {
        process.stderr.write(
          `- ${result.path}:${result.startLine ?? '?'} ${result.ruleId} ${result.message}\n`
        );
      }
    }
    if (touchedProductionDrift.length > 0) {
      process.stderr.write('\nTouched-file drift:\n');
      for (const result of touchedProductionDrift) {
        process.stderr.write(
          `- ${result.path}:${result.startLine ?? '?'} [${result.level}] ${result.ruleId} count ${result.count} > baseline ${result.baselineCount}: ${result.message}\n`
        );
      }
    }
    if (touchedNotificationDrift.length > 0) {
      process.stderr.write('\nTouched notification drift:\n');
      for (const notification of touchedNotificationDrift) {
        process.stderr.write(
          `- [${notification.level}] ${notification.descriptorId} count ${notification.count} > baseline ${notification.baselineCount}: ${notification.message}\n`
        );
      }
    }
    process.stderr.write(`\nFull logs: ${path.relative(PROJECT_ROOT, LOG_PATH)}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write('Codacy analyze guard passed.\n');
}

await main();

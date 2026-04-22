#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

import {
  PROJECT_ROOT,
  isProductionPath,
  listKnownRepoFiles,
  normalizeSarifPath,
  readJson,
} from './lib/qualityGuardUtils.mjs';

const ALLOWLIST_PATH = '.codacy/allowlist.json';
const SARIF_PATH = 'reports/quality/codacy.sarif';
const BASELINE_PATH = '.quality/codacy-baseline.json';

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

function groupCounts(items, keyBuilder) {
  const counts = new Map();
  for (const item of items) {
    const key = keyBuilder(item);
    const current = counts.get(key);
    if (current) {
      current.count += 1;
      continue;
    }
    counts.set(key, { ...item, count: 1 });
  }
  return Array.from(counts.values()).sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right))
  );
}

async function main() {
  const [sarifRaw, allowlist, knownFiles] = await Promise.all([
    fs.readFile(path.join(PROJECT_ROOT, SARIF_PATH), 'utf8'),
    readJson(ALLOWLIST_PATH, { results: [], notifications: [] }),
    listKnownRepoFiles(),
  ]);
  const knownFilesSet = new Set(knownFiles);
  const results = [];
  const notifications = [];

  for (const run of JSON.parse(sarifRaw).runs ?? []) {
    const tool = run.tool?.driver?.name ?? 'unknown';
    for (const result of run.results ?? []) {
      const location = result.locations?.[0]?.physicalLocation ?? {};
      const normalizedPath = normalizeSarifPath(
        location.artifactLocation?.uri ?? '',
        knownFilesSet
      );
      const normalizedResult = {
        tool,
        ruleId: result.ruleId ?? 'UNKNOWN_RULE',
        level: result.level ?? 'warning',
        path: normalizedPath,
      };
      if (!isProductionPath(normalizedPath) || allowlistedResult(normalizedResult, allowlist)) {
        continue;
      }
      results.push(normalizedResult);
    }

    for (const invocation of run.invocations ?? []) {
      for (const notification of invocation.toolExecutionNotifications ?? []) {
        const normalizedNotification = {
          tool,
          descriptorId: notification.descriptor?.id ?? 'UNKNOWN_NOTIFICATION',
          level: notification.level ?? 'warning',
          message: notification.message?.text ?? '',
        };
        const touchesProductionPath = knownFiles.some(
          (filePath) =>
            isProductionPath(filePath) && normalizedNotification.message.includes(filePath)
        );
        if (!touchesProductionPath || allowlistedNotification(normalizedNotification, allowlist)) {
          continue;
        }
        notifications.push(normalizedNotification);
      }
    }
  }

  const baseline = {
    generatedAt: new Date().toISOString(),
    results: groupCounts(results, (result) =>
      [result.tool, result.path, result.ruleId, result.level].join('::')
    ),
    notifications: groupCounts(notifications, (notification) =>
      [notification.tool, notification.descriptorId, notification.level].join('::')
    ).map(({ message: _message, ...notification }) => notification),
  };

  await fs.writeFile(
    path.join(PROJECT_ROOT, BASELINE_PATH),
    `${JSON.stringify(baseline, null, 2)}\n`,
    'utf8'
  );

  process.stdout.write(
    `Wrote ${baseline.results.length} result groups and ${baseline.notifications.length} notification groups to ${BASELINE_PATH}.\n`
  );
}

await main();

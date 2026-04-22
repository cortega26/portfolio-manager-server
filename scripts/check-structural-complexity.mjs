#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  compareCountMaps,
  PROJECT_ROOT,
  QUALITY_REPORT_DIR,
  collectTouchedFiles,
  isProductionCodePath,
  readJson,
  writeJsonReport,
} from './lib/qualityGuardUtils.mjs';

const ALLOWLIST_PATH = '.codacy/allowlist.json';
const BASELINE_PATH = '.quality/codacy-baseline.json';
const COMPLEXITY_CONFIG_PATH = '.quality/structural-complexity.json';
const SARIF_PATH = path.join(QUALITY_REPORT_DIR, 'codacy.sarif');

function buildResultKey(result) {
  return [result.tool, result.path, result.ruleId, result.level].join('::');
}

function allowlistedRule(filePath, ruleId, allowlist) {
  return (allowlist.results ?? []).some(
    (entry) => entry.path === filePath && entry.ruleId === ruleId
  );
}

function collectLizardFindings(data) {
  const findings = [];
  for (const run of data.runs ?? []) {
    const tool = run.tool?.driver?.name ?? '';
    if (tool !== 'Lizard') {
      continue;
    }
    for (const result of run.results ?? []) {
      const uri = result.locations?.[0]?.physicalLocation?.artifactLocation?.uri ?? '';
      findings.push({
        path: String(uri).replace(/\\/gu, '/').replace(/^\.\//u, ''),
        ruleId: result.ruleId ?? 'UNKNOWN_RULE',
        message: result.message?.text ?? '',
        level: result.level ?? 'warning',
      });
    }
  }
  return findings;
}

function computeDuplicateWindowCount(sourceText, windowSize) {
  const significantLines = sourceText
    .split('\n')
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        !line.startsWith('//') &&
        !line.startsWith('/*') &&
        !line.startsWith('*') &&
        line !== '{' &&
        line !== '}' &&
        line !== '},'
    );

  const counts = new Map();
  for (let index = 0; index <= significantLines.length - windowSize; index += 1) {
    const window = significantLines.slice(index, index + windowSize).join('\n');
    counts.set(window, (counts.get(window) ?? 0) + 1);
  }

  let duplicates = 0;
  for (const count of counts.values()) {
    if (count > 1) {
      duplicates += count - 1;
    }
  }
  return duplicates;
}

async function main() {
  const [allowlist, baseline, config, touchedFiles, sarifRaw] = await Promise.all([
    readJson(ALLOWLIST_PATH, { results: [] }),
    readJson(BASELINE_PATH, { results: [] }),
    readJson(COMPLEXITY_CONFIG_PATH, {
      duplication: { windowSize: 4, maxRepeatedWindows: 8 },
      duplicationOverrides: {},
    }),
    collectTouchedFiles(),
    fs.readFile(SARIF_PATH, 'utf8'),
  ]);

  const touchedProductionFiles = touchedFiles.filter(isProductionCodePath);
  const lizardFindings = collectLizardFindings(JSON.parse(sarifRaw));
  const duplicationProblems = [];
  const currentLizardGroups = [];

  for (const filePath of touchedProductionFiles) {
    const fileFindings = lizardFindings.filter(
      (finding) =>
        finding.path === filePath &&
        ['Lizard_file-nloc-medium', 'Lizard_nloc-medium', 'Lizard_ccn-medium'].includes(
          finding.ruleId
        ) &&
        !allowlistedRule(filePath, finding.ruleId, allowlist)
    );
    currentLizardGroups.push(
      ...fileFindings.map((finding) => ({ ...finding, tool: 'Lizard', count: 1 }))
    );

    const sourceText = await fs.readFile(path.join(PROJECT_ROOT, filePath), 'utf8');
    const override = config.duplicationOverrides?.[filePath] ?? {};
    const windowSize = override.windowSize ?? config.duplication.windowSize;
    const maxRepeatedWindows = override.maxRepeatedWindows ?? config.duplication.maxRepeatedWindows;
    const duplicateWindowCount = computeDuplicateWindowCount(sourceText, windowSize);
    if (duplicateWindowCount > maxRepeatedWindows) {
      duplicationProblems.push({
        path: filePath,
        duplicateWindowCount,
        maxRepeatedWindows,
      });
    }
  }
  const lizardDrift = compareCountMaps(
    currentLizardGroups,
    (baseline.results ?? []).filter((result) => result.tool === 'Lizard'),
    buildResultKey
  );

  const summary = {
    generatedAt: new Date().toISOString(),
    touchedProductionFiles,
    lizardDrift,
    duplicationProblems,
  };

  await writeJsonReport('complexity-summary.json', summary);

  if (lizardDrift.length > 0 || duplicationProblems.length > 0) {
    process.stderr.write('Structural complexity guard failed.\n');
    for (const finding of lizardDrift) {
      process.stderr.write(
        `- ${finding.path} ${finding.ruleId} count ${finding.count} > baseline ${finding.baselineCount}: ${finding.message}\n`
      );
    }
    for (const problem of duplicationProblems) {
      process.stderr.write(
        `- ${problem.path} duplicate windows ${problem.duplicateWindowCount} > ${problem.maxRepeatedWindows}\n`
      );
    }
    process.exitCode = 1;
    return;
  }

  process.stdout.write('Structural complexity guard passed.\n');
}

await main();

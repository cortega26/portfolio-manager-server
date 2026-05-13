#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');

async function readLcov(relPath) {
  const absPath = path.join(PROJECT_ROOT, relPath);
  try {
    return await readFile(absPath, 'utf8');
  } catch {
    return '';
  }
}

async function main() {
  const frontendLcov = await readLcov('coverage/lcov.info');
  const backendLcov = await readLcov('coverage/server/lcov.info');

  if (!frontendLcov && !backendLcov) {
    process.stdout.write('No coverage reports found to merge.\n');
    return;
  }

  const mergedDir = path.join(PROJECT_ROOT, 'coverage', 'merged');
  await mkdir(mergedDir, { recursive: true });

  const frontendRecords = frontendLcov
    ? frontendLcov.split(/(?=^end_of_record\s)/mu).filter(Boolean)
    : [];
  const backendRecords = backendLcov
    ? backendLcov.split(/(?=^end_of_record\s)/mu).filter(Boolean)
    : [];

  // Deduplicate by SF: line within each source
  const seenFiles = new Set();
  const allRecords = [...frontendRecords, ...backendRecords];
  const deduped = allRecords.filter((record) => {
    const sfMatch = record.match(/^SF:(.+)$/mu);
    if (!sfMatch) return true;
    const key = sfMatch[1].trim();
    if (seenFiles.has(key)) return false;
    seenFiles.add(key);
    return true;
  });

  const merged = deduped.join('\n').replace(/\n{3,}/gu, '\n\n');
  await writeFile(path.join(mergedDir, 'lcov.info'), merged, 'utf8');

  const frontendCount = frontendLcov ? (frontendLcov.match(/^SF:/gmu) || []).length : 0;
  const backendCount = backendLcov ? (backendLcov.match(/^SF:/gmu) || []).length : 0;

  process.stdout.write(
    `Merged coverage report written to coverage/merged/lcov.info\n` +
      `  Frontend (vitest): ${frontendCount} files\n` +
      `  Backend  (node:test): ${backendCount} files\n` +
      `  Merged:  ${deduped.length} records (${allRecords.length - deduped.length} duplicates removed)\n`
  );
}

main().catch((error) => {
  process.stderr.write(`Error: ${error.message}\n`);
  process.exitCode = 1;
});

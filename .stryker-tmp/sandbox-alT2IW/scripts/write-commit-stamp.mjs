#!/usr/bin/env node
// @ts-nocheck
import { dirname } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

function resolveCommitFromGit() {
  const result = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    const message = result.stderr?.trim() || 'unknown git error';
    throw new Error(`Unable to resolve commit hash via git: ${message}`);
  }
  return result.stdout.trim();
}

function main() {
  const [, , destination, commitArg] = process.argv;
  if (!destination) {
    console.error('Usage: node write-commit-stamp.mjs <output-path> [commit]');
    process.exitCode = 1;
    return;
  }

  const candidateCommit = commitArg || process.env.GITHUB_SHA;
  const commit = (candidateCommit ? candidateCommit.slice(0, 7) : resolveCommitFromGit()).trim();
  if (!commit) {
    console.error('Unable to determine commit hash.');
    process.exitCode = 1;
    return;
  }

  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, `${commit}\n`, 'utf8');
  console.info(`Wrote commit stamp ${commit} to ${destination}`);
}

main();

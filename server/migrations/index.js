import path from 'path';
import { promises as fs } from 'fs';

import JsonTableStorage from '../data/storage.js';

const MIGRATIONS = [
  {
    id: '001_cash_benchmarks',
    description: 'Initialize cash & benchmark data tables',
    async up(storage) {
      await storage.ensureTable('transactions', []);
      await storage.ensureTable('cash_rates', []);
      await storage.ensureTable('prices', []);
      await storage.ensureTable('nav_snapshots', []);
      await storage.ensureTable('returns_daily', []);
      await storage.ensureTable('jobs_state', []);
    },
  },
];

async function readStateFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { applied: [] };
    }
    throw error;
  }
}

async function writeStateFile(filePath, state) {
  const serialized = `${JSON.stringify(state, null, 2)}\n`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, serialized, 'utf8');
}

export async function runMigrations({ dataDir, logger }) {
  const storage = new JsonTableStorage({ dataDir, logger });
  const statePath = path.join(dataDir, '_migrations_state.json');
  const state = await readStateFile(statePath);
  const appliedSet = new Set(state.applied ?? []);

  for (const migration of MIGRATIONS) {
    if (appliedSet.has(migration.id)) {
      continue;
    }
    if (logger?.info) {
      logger.info('applying_migration', { id: migration.id });
    }
    await migration.up(storage);
    appliedSet.add(migration.id);
    state.applied = Array.from(appliedSet);
    await writeStateFile(statePath, state);
  }

  return storage;
}

export default runMigrations;

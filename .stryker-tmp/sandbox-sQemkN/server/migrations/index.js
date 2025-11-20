// @ts-nocheck
import path from 'path';
import { promises as fs } from 'fs';

import JsonTableStorage from '../data/storage.js';
import { PORTFOLIO_SCHEMA_VERSION, CASH_POLICY_SCHEMA_VERSION } from '../../shared/constants.js';
import { atomicWriteFile } from '../utils/atomicStore.js';

const PORTFOLIO_FILE_PREFIX = 'portfolio_';
const PORTFOLIO_FILE_SUFFIX = '.json';

async function pathExists(candidate) {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
}

function normalizeCurrencyCode(value) {
  if (typeof value !== 'string') {
    return 'USD';
  }
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{3}$/u.test(normalized) ? normalized : 'USD';
}

function toIsoDate(value) {
  if (!value) {
    return null;
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return value;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

function normalizeTimeline(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((entry) => {
      const from = toIsoDate(entry?.from ?? entry?.effective_date ?? entry?.date);
      if (!from) {
        return null;
      }
      const to = toIsoDate(entry?.to ?? entry?.through ?? null);
      const apy = Number.isFinite(entry?.apy) ? Number(entry.apy) : 0;
      return { from, to: to ?? null, apy };
    })
    .filter(Boolean)
    .sort((a, b) => a.from.localeCompare(b.from));
}

function buildTimelineFromRates(rates) {
  return normalizeTimeline(
    rates.map((row) => ({ from: row?.effective_date, apy: row?.apy })),
  );
}

const MIGRATIONS = [
  {
    id: '001_cash_benchmarks',
    description: 'Initialize cash & benchmark data tables',
    async up({ storage }) {
      await storage.ensureTable('transactions', []);
      await storage.ensureTable('cash_rates', []);
      await storage.ensureTable('prices', []);
      await storage.ensureTable('nav_snapshots', []);
      await storage.ensureTable('returns_daily', []);
      await storage.ensureTable('jobs_state', []);
    },
  },
  {
    id: '002_portfolio_keys',
    description: 'Create portfolio_keys table for hashed API credentials',
    async up({ storage }) {
      await storage.ensureTable('portfolio_keys', []);
    },
  },
  {
    id: '003_cash_interest_accruals',
    description: 'Track buffered monthly cash interest accruals',
    async up({ storage }) {
      await storage.ensureTable('cash_interest_accruals', []);
    },
  },
  {
    id: '004_portfolio_cash_policy',
    description: 'Normalize portfolio cash policy schema',
    async up({ storage, dataDir, logger }) {
      const rates = await storage.readTable('cash_rates');
      const defaultTimeline = buildTimelineFromRates(rates);
      let migrated = 0;
      const entries = await fs.readdir(dataDir);
      for (const entry of entries) {
        if (!entry.startsWith(PORTFOLIO_FILE_PREFIX) || !entry.endsWith(PORTFOLIO_FILE_SUFFIX)) {
          continue;
        }
        const filePath = path.join(dataDir, entry);
        let raw;
        try {
          raw = await fs.readFile(filePath, 'utf8');
        } catch (error) {
          if (error.code === 'ENOENT') {
            continue;
          }
          throw error;
        }
        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch {
          continue;
        }
        const currentVersion = Number(parsed.schemaVersion ?? 0);
        const cashVersion = Number(parsed.cash?.version ?? 0);
        if (
          currentVersion >= PORTFOLIO_SCHEMA_VERSION
          && cashVersion >= CASH_POLICY_SCHEMA_VERSION
        ) {
          continue;
        }
        const existingTimeline = normalizeTimeline(parsed.cash?.apyTimeline);
        const timeline = existingTimeline.length > 0 ? existingTimeline : defaultTimeline;
        const next = {
          ...parsed,
          schemaVersion: PORTFOLIO_SCHEMA_VERSION,
          cash: {
            currency: normalizeCurrencyCode(parsed.cash?.currency),
            apyTimeline: timeline,
            version: CASH_POLICY_SCHEMA_VERSION,
          },
        };
        const backupPath = `${filePath}.bak`;
        if (!(await pathExists(backupPath))) {
          await fs.copyFile(filePath, backupPath);
        }
        await atomicWriteFile(filePath, `${JSON.stringify(next, null, 2)}\n`);
        migrated += 1;
      }
      logger?.info?.('portfolio_cash_policy_migrated', { migrated });
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
  await atomicWriteFile(filePath, serialized);
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
    await migration.up({ storage, dataDir, logger });
    appliedSet.add(migration.id);
    state.applied = Array.from(appliedSet);
    await writeStateFile(statePath, state);
  }

  return storage;
}

export default runMigrations;

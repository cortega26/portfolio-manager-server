import JsonTableStorage from '../data/storage.js';
import { atomicWriteFile } from '../utils/atomicStore.js';
import { promises as fs } from 'fs';
import path from 'path';
import { d, roundDecimal } from '../finance/decimal.js';

const NVDA_ALL_TRADES_ADJUSTMENT_RULE = 'NVDA_10_FOR_1_PRE_2024_06_10_ALL_TRADES';

function isLegacyNvdaPreSplitCsvBootstrapTransaction(row) {
  return row?.ticker === 'NVDA'
    && (row?.type === 'BUY' || row?.type === 'SELL')
    && typeof row?.date === 'string'
    && row.date < '2024-06-10'
    && row?.metadata?.system?.import?.source === 'csv-bootstrap';
}

function buildAdjustedNvdaTransaction(row) {
  const originalQuantity = row?.metadata?.system?.import?.original?.quantity;
  const baseQuantity = d(originalQuantity ?? row?.shares ?? 0).abs();
  if (baseQuantity.isZero()) {
    return row;
  }

  const adjustedShares = roundDecimal(baseQuantity.times(10), 9);
  const quantity = row.type === 'SELL'
    ? adjustedShares.neg()
    : adjustedShares;
  const amount = d(row?.amount ?? 0).abs();
  const price = amount.isZero()
    ? d(0)
    : roundDecimal(amount.div(adjustedShares), 8);

  return {
    ...row,
    shares: adjustedShares.toNumber(),
    quantity: quantity.toNumber(),
    price: price.toNumber(),
    metadata: {
      ...row.metadata,
      system: {
        ...row.metadata?.system,
        import: {
          ...row.metadata?.system?.import,
          adjustment: {
            rule: NVDA_ALL_TRADES_ADJUSTMENT_RULE,
            factor: '10',
          },
        },
      },
    },
  };
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
    description: 'Create portfolio_keys table (schema compat, no longer used in runtime)',
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
    description: 'Initialize portfolio cash policy tables (SQLite-only, no JSON migration)',
    async up({ storage, logger }) {
      // Fresh install: ensure the table exists with empty data.
      // No legacy JSON files are read — the app starts from a clean SQLite state.
      await storage.ensureTable('cash_rates', []);
      logger?.info?.('portfolio_cash_policy_migrated', { migrated: 0 });
    },
  },
  {
    id: '005_nvda_presplit_split_backfill',
    description: 'Backfill NVDA pre-split csv transactions to apply the 10:1 adjustment to all trades',
    async up({ storage, logger }) {
      const transactions = await storage.readTable('transactions');
      if (!Array.isArray(transactions) || transactions.length === 0) {
        logger?.info?.('nvda_presplit_split_backfill_applied', { migrated: 0 });
        return;
      }

      let migrated = 0;
      const nextTransactions = transactions.map((row) => {
        if (!isLegacyNvdaPreSplitCsvBootstrapTransaction(row)) {
          return row;
        }

        const nextRow = buildAdjustedNvdaTransaction(row);
        const changed =
          nextRow.shares !== row.shares
          || nextRow.quantity !== row.quantity
          || nextRow.price !== row.price
          || nextRow.metadata?.system?.import?.adjustment?.rule
            !== row.metadata?.system?.import?.adjustment?.rule;

        if (changed) {
          migrated += 1;
        }

        return nextRow;
      });

      if (migrated > 0) {
        await storage.writeTable('transactions', nextTransactions);
      }
      logger?.info?.('nvda_presplit_split_backfill_applied', { migrated });
    },
  },
  {
    id: '006_portfolio_pins',
    description: 'Initialize local per-portfolio PIN hashes for desktop session unlock',
    async up({ storage }) {
      await storage.ensureTable('portfolio_pins', []);
    },
  },
  {
    id: '007_roi_history',
    description: 'Initialize canonical ROI history tables',
    async up({ storage }) {
      await storage.ensureTable('roi_daily', []);
      await storage.ensureTable('roi_sync_state', []);
    },
  },
  {
    id: '008_signal_notifications',
    description: 'Initialize persistent backend signal state and notification tables',
    async up({ storage }) {
      await storage.ensureTable('signal_notification_states', []);
      await storage.ensureTable('signal_notifications', []);
    },
  },
  {
    id: '009_inbox_reviews',
    description: 'Initialize inbox_reviews table for Action Inbox dismiss state (Phase 5)',
    async up({ storage }) {
      await storage.ensureTable('inbox_reviews', []);
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

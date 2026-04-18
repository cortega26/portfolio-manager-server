/**
 * server/__tests__/helpers/testFixtures.js
 *
 * Reusable seed data for backend tests.
 * Import these in beforeEach to pre-populate the in-test JsonTableStorage.
 */

// ── Default portfolio seed ────────────────────────────────────────────────────

export const DEFAULT_PORTFOLIO_ID = 'test-portfolio';

export const DEFAULT_TRANSACTIONS = [
  {
    uid: 'tx-001',
    date: '2024-01-01',
    type: 'DEPOSIT',
    amount: 10000,
    seq: 1,
    createdAt: 1704067200000,
  },
  {
    uid: 'tx-002',
    date: '2024-01-02',
    ticker: 'AAPL',
    type: 'BUY',
    amount: -1500.5,
    shares: 10,
    price: 150.05,
    seq: 2,
    createdAt: 1704153600000,
  },
];

export const DEFAULT_CASH_RATES = [
  { currency: 'USD', from: '2024-01-01', to: null, apy: 4.5 },
];

export const DEFAULT_RETURNS_DAILY = [
  {
    date: '2024-01-01',
    r_port: 0,
    r_ex_cash: 0,
    r_spy_100: 0,
    r_bench_blended: 0,
    r_cash: 0,
  },
  {
    date: '2024-01-02',
    r_port: 0.01,
    r_ex_cash: 0.011,
    r_spy_100: 0.005,
    r_bench_blended: 0.0075,
    r_cash: 0.0001,
  },
];

export const DEFAULT_NAV_SNAPSHOTS = [
  {
    date: '2024-01-01',
    portfolio_nav: 10000,
    ex_cash_nav: 0,
    cash_balance: 10000,
    risk_assets_value: 0,
    stale_price: false,
  },
  {
    date: '2024-01-02',
    portfolio_nav: 10100,
    ex_cash_nav: 1500,
    cash_balance: 8600,
    risk_assets_value: 1500,
    stale_price: false,
  },
];

// ── Seed helper ───────────────────────────────────────────────────────────────

/**
 * Seeds a JsonTableStorage with default data for the given portfolio ID.
 *
 * @param {object} storage       — JsonTableStorage instance
 * @param {string} portfolioId   — portfolio ID to seed (default: DEFAULT_PORTFOLIO_ID)
 */
export async function seedDefaultPortfolio(storage, portfolioId = DEFAULT_PORTFOLIO_ID) {
  await storage.ensureTable('transactions', []);
  await storage.ensureTable('cash_rates', []);
  await storage.ensureTable('returns_daily', []);
  await storage.ensureTable('nav_snapshots', []);
  await storage.ensureTable('prices', []);
  await storage.ensureTable('roi_daily', []);

  // Write portfolio state (nested under portfolio key)
  const portfolioState = {
    transactions: DEFAULT_TRANSACTIONS,
    signals: {},
  };
  await storage.writeTable(`portfolio_${portfolioId}`, portfolioState);
  await storage.writeTable('returns_daily', DEFAULT_RETURNS_DAILY);
  await storage.writeTable('nav_snapshots', DEFAULT_NAV_SNAPSHOTS);
}

/**
 * Seeds minimal tables needed for most non-portfolio API tests.
 */
export async function seedEmptyTables(storage) {
  await storage.ensureTable('transactions', []);
  await storage.ensureTable('cash_rates', []);
  await storage.ensureTable('returns_daily', []);
  await storage.ensureTable('nav_snapshots', []);
  await storage.ensureTable('prices', []);
  await storage.ensureTable('roi_daily', []);
}

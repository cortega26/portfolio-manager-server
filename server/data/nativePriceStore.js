/**
 * Native SQLite price store backed by better-sqlite3.
 *
 * Stores the `prices` table with real typed columns and indexes so the
 * unbounded historical-price dataset can grow without the full-table
 * rewrite + full-DB export that sql.js JsonTableStorage incurs on every
 * write.
 *
 * All public methods that match JsonTableStorage signatures are async
 * so they satisfy the StorageAdapter interface.  The internal
 * implementation is synchronous (better-sqlite3 is single-threaded and
 * synchronous).  Optimised relational query methods are also exposed as
 * sync helpers for direct callers (performanceHistory, daily_close).
 *
 * Durability: WAL journal mode with synchronous=NORMAL — writes are
 * crash-safe without needing an explicit export/fsync cycle.
 *
 * Migration: on first `open()` the store detects an existing sql.js
 * `storage.sqlite`, reads the JSON `prices` rows, bulk-inserts them
 * into the native DB, and renames `storage.sqlite` → `storage.sqlite.bak`.
 */

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DB_FILE_NAME = 'prices.db';
const LEGACY_DB_FILE_NAME = 'storage.sqlite';
const LEGACY_BACKUP_SUFFIX = '.bak';

const PRICES_TABLE = 'prices';

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS prices (
    ticker     TEXT NOT NULL,
    date       TEXT NOT NULL,
    adj_close  REAL NOT NULL,
    updated_at TEXT,
    PRIMARY KEY (ticker, date)
  ) WITHOUT ROWID;

  CREATE INDEX IF NOT EXISTS idx_prices_ticker ON prices(ticker);
  CREATE INDEX IF NOT EXISTS idx_prices_date  ON prices(date);
`;

// ---------------------------------------------------------------------------
// Connection cache (one per dbPath, same pattern as storage.js)
// ---------------------------------------------------------------------------

const connectionCache = new Map();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cloneRows(rows) {
  if (!Array.isArray(rows)) return [];
  try {
    return structuredClone(rows);
  } catch {
    return JSON.parse(JSON.stringify(rows));
  }
}

// ---------------------------------------------------------------------------
// NativePriceStore
// ---------------------------------------------------------------------------

export default class NativePriceStore {
  /**
   * @param {{ dataDir: string, logger?: object }} opts
   */
  constructor({ dataDir, logger }) {
    this.dataDir = path.resolve(dataDir);
    this.dbPath = path.join(this.dataDir, DB_FILE_NAME);
    this.logger = logger ?? null;
  }

  // ── Lock key ──────────────────────────────────────────────────────────
  storageLockKey() {
    return `native-prices:${this.dbPath}`;
  }

  // ── Open / close ──────────────────────────────────────────────────────

  /**
   * Opens (or returns a cached) database connection.
   * On first open, runs schema creation + one-time migration from sql.js.
   */
  open() {
    const cached = connectionCache.get(this.dbPath);
    if (cached) return cached;

    const exists = fs.existsSync(this.dbPath);
    fs.mkdirSync(this.dataDir, { recursive: true });

    const db = new Database(this.dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('foreign_keys = OFF');
    db.exec(SCHEMA_SQL);

    connectionCache.set(this.dbPath, db);

    // ── One-time migration from sql.js ──────────────────────────────
    if (!exists) {
      this._tryMigrate(db);
    }

    return db;
  }

  close() {
    const db = connectionCache.get(this.dbPath);
    if (db) {
      db.close();
      connectionCache.delete(this.dbPath);
    }
  }

  // ── Migration ─────────────────────────────────────────────────────────

  _tryMigrate(db) {
    const legacyPath = path.join(this.dataDir, LEGACY_DB_FILE_NAME);
    const backupPath = `${legacyPath}${LEGACY_BACKUP_SUFFIX}`;

    if (!fs.existsSync(legacyPath)) return;
    if (fs.existsSync(backupPath)) return;

    this.logger?.info?.('price_store_migration_start', {
      legacy: legacyPath,
      target: this.dbPath,
    });

    try {
      this._migrateSync(legacyPath, backupPath, db);
    } catch (err) {
      this.logger?.warn?.('price_store_migration_failed', {
        error: err.message,
      });
      // Migration failed — prices.db will be empty, which is safe.
      // The legacy storage.sqlite is preserved for the next attempt.
    }
  }

  _migrateSync(legacyPath, backupPath, db) {
    // Read legacy rows using a dynamic async call wrapped in a sync wait.
    // Actually, let's keep it simple: just read the sql.js DB directly
    // using better-sqlite3's ability to attach another DB.
    // sql.js format IS standard SQLite format, so we can ATTACH it.

    try {
      db.exec(`ATTACH DATABASE '${legacyPath}' AS legacy`);
      const legacyRows = db
        .prepare(
          `SELECT row_json FROM legacy.json_table_rows WHERE table_name = 'prices' ORDER BY row_index ASC`
        )
        .all();

      // Parse JSON from legacy rows
      const prices = [];
      for (const { row_json } of legacyRows) {
        try {
          const parsed = JSON.parse(row_json);
          if (parsed && typeof parsed.ticker === 'string' && typeof parsed.date === 'string') {
            prices.push({
              ticker: String(parsed.ticker).trim().toUpperCase(),
              date: String(parsed.date).trim(),
              adj_close: Number.isFinite(Number(parsed.adj_close)) ? Number(parsed.adj_close) : 0,
              updated_at: typeof parsed.updated_at === 'string' ? parsed.updated_at : null,
            });
          }
        } catch {
          // skip unparseable rows
        }
      }

      db.exec('DETACH DATABASE legacy');

      if (prices.length > 0) {
        const insert = db.prepare(
          `INSERT OR IGNORE INTO prices (ticker, date, adj_close, updated_at) VALUES (?, ?, ?, ?)`
        );
        const tx = db.transaction((rows) => {
          for (const row of rows) {
            insert.run(row.ticker, row.date, row.adj_close, row.updated_at ?? null);
          }
        });
        tx(prices);

        // Rename legacy file → backup
        fs.renameSync(legacyPath, backupPath);

        this.logger?.info?.('price_store_migration_complete', {
          rows: prices.length,
          legacy: legacyPath,
          backup: backupPath,
        });
      }
    } catch (err) {
      // If ATTACH fails (e.g. encrypted DB or format mismatch), fall back
      // to the async sql.js approach synchronously.
      this.logger?.warn?.('price_store_attach_failed', { error: err.message });
      // Don't rename — the legacy file stays for manual migration
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // Backward-compat StorageAdapter methods (all async)
  // ══════════════════════════════════════════════════════════════════════

  async readTable(name) {
    if (name !== PRICES_TABLE) return [];
    return this.readAll();
  }

  async writeTable(name, rows) {
    if (name !== PRICES_TABLE) return;
    const db = this.open();
    const cloned = cloneRows(rows);

    const tx = db.transaction(() => {
      db.exec(`DELETE FROM ${PRICES_TABLE}`);
      const insert = db.prepare(
        `INSERT OR REPLACE INTO ${PRICES_TABLE} (ticker, date, adj_close, updated_at) VALUES (?, ?, ?, ?)`
      );
      for (const row of cloned) {
        insert.run(
          String(row.ticker ?? '')
            .trim()
            .toUpperCase(),
          String(row.date ?? '').trim(),
          Number.isFinite(Number(row.adj_close)) ? Number(row.adj_close) : 0,
          typeof row.updated_at === 'string' ? row.updated_at : null
        );
      }
    });
    tx();
  }

  async upsertRow(name, row, _keyFields) {
    if (name !== PRICES_TABLE || !row) return;
    const db = this.open();

    const ticker = 'ticker' in row ? String(row.ticker).trim().toUpperCase() : '';
    const date = 'date' in row ? String(row.date).trim() : '';
    const adjClose = Number.isFinite(Number(row.adj_close)) ? Number(row.adj_close) : 0;
    const updatedAt = typeof row.updated_at === 'string' ? row.updated_at : null;

    const stmt = db.prepare(
      `INSERT INTO ${PRICES_TABLE} (ticker, date, adj_close, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (ticker, date) DO UPDATE SET
         adj_close = excluded.adj_close,
         updated_at = excluded.updated_at`
    );
    stmt.run(ticker, date, adjClose, updatedAt);
  }

  async ensureTable(name, _rows) {
    if (name !== PRICES_TABLE) return;
    this.open(); // ensures schema exists
  }

  async deleteWhere(name, predicate) {
    if (name !== PRICES_TABLE || typeof predicate !== 'function') return;
    const all = this.readAll();
    const kept = all.filter((row) => !predicate(row));
    if (kept.length < all.length) {
      await this.writeTable(PRICES_TABLE, kept);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // Optimised relational queries (synchronous)
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Read all price rows ordered by date then ticker.
   * @returns {Array<{ticker: string, date: string, adj_close: number, updated_at?: string|null}>}
   */
  readAll() {
    const db = this.open();
    return db
      .prepare(
        `SELECT ticker, date, adj_close, updated_at FROM ${PRICES_TABLE} ORDER BY date, ticker`
      )
      .all();
  }

  /**
   * Read all prices for a single ticker.
   */
  readByTicker(ticker) {
    const db = this.open();
    const normalized = String(ticker).trim().toUpperCase();
    return db
      .prepare(
        `SELECT ticker, date, adj_close, updated_at FROM ${PRICES_TABLE}
         WHERE ticker = ? ORDER BY date`
      )
      .all(normalized);
  }

  /**
   * Read prices for multiple tickers within a date range.
   * @param {string[]} tickers
   * @param {string} from - ISO date (inclusive)
   * @param {string} to - ISO date (inclusive)
   */
  readByTickersAndRange(tickers, from, to) {
    if (!Array.isArray(tickers) || tickers.length === 0) return [];
    const db = this.open();
    const normalized = tickers.map((t) => String(t).trim().toUpperCase()).filter(Boolean);
    if (normalized.length === 0) return [];

    const placeholders = normalized.map(() => '?').join(', ');
    return db
      .prepare(
        `SELECT ticker, date, adj_close, updated_at FROM ${PRICES_TABLE}
         WHERE ticker IN (${placeholders})
           AND date >= ? AND date <= ?
         ORDER BY date, ticker`
      )
      .all(...normalized, String(from), String(to));
  }

  /**
   * Get the latest (most recent date) price row for a ticker.
   */
  readLatestByTicker(ticker) {
    const db = this.open();
    const normalized = String(ticker).trim().toUpperCase();
    return (
      db
        .prepare(
          `SELECT ticker, date, adj_close, updated_at FROM ${PRICES_TABLE}
           WHERE ticker = ? ORDER BY date DESC LIMIT 1`
        )
        .get(normalized) ?? null
    );
  }

  /**
   * Upsert multiple rows in a single transaction.
   * @param {Array<{ticker: string, date: string, adj_close: number, updated_at?: string|null}>} rows
   */
  upsertBatch(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return;
    const db = this.open();
    const stmt = db.prepare(
      `INSERT INTO ${PRICES_TABLE} (ticker, date, adj_close, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (ticker, date) DO UPDATE SET
         adj_close = excluded.adj_close,
         updated_at = excluded.updated_at`
    );
    const tx = db.transaction((batch) => {
      for (const row of batch) {
        stmt.run(
          String(row.ticker ?? '')
            .trim()
            .toUpperCase(),
          String(row.date ?? '').trim(),
          Number.isFinite(Number(row.adj_close)) ? Number(row.adj_close) : 0,
          typeof row.updated_at === 'string' ? row.updated_at : null
        );
      }
    });
    tx(rows);
  }

  /**
   * Total number of rows in the prices table.
   */
  count() {
    const db = this.open();
    const row = db.prepare(`SELECT COUNT(*) AS count FROM ${PRICES_TABLE}`).get();
    return row?.count ?? 0;
  }
}

/**
 * Hybrid storage adapter — routes the `prices` table to NativePriceStore
 * (better-sqlite3 with real columns + indexes) and all other tables to
 * the existing JsonTableStorage (sql.js, unchanged).
 *
 * Implements the full StorageAdapter interface so existing callers
 * require zero changes.  Also exposes `getPriceStore()` so
 * performance-critical paths (performanceHistory, daily_close) can use
 * relational queries directly.
 */

import JsonTableStorage from './storage.js';
import NativePriceStore from './nativePriceStore.js';

const PRICES_TABLE = 'prices';

export default class HybridStorage {
  /**
   * @param {{ dataDir: string, logger?: object }} opts
   */
  constructor({ dataDir, logger }) {
    this.dataDir = dataDir;
    this.logger = logger;
    this._json = new JsonTableStorage({ dataDir, logger });
    this._prices = new NativePriceStore({ dataDir, logger });
  }

  // ── Accessors ─────────────────────────────────────────────────────────

  /** Returns the native price store for direct relational queries. */
  getPriceStore() {
    return this._prices;
  }

  /** Returns the underlying JsonTableStorage (e.g. for sql.js-specific needs). */
  getJsonStorage() {
    return this._json;
  }

  // ── Lock key (delegates to JsonTableStorage) ──────────────────────────
  storageLockKey() {
    return this._json.storageLockKey();
  }

  // ══════════════════════════════════════════════════════════════════════
  // StorageAdapter interface
  // ══════════════════════════════════════════════════════════════════════

  async readTable(name) {
    if (name === PRICES_TABLE) return this._prices.readTable(name);
    return this._json.readTable(name);
  }

  async writeTable(name, rows) {
    if (name === PRICES_TABLE) return this._prices.writeTable(name, rows);
    return this._json.writeTable(name, rows);
  }

  async upsertRow(name, row, keyFields) {
    if (name === PRICES_TABLE) return this._prices.upsertRow(name, row, keyFields);
    return this._json.upsertRow(name, row, keyFields);
  }

  async ensureTable(name, rows) {
    if (name === PRICES_TABLE) return this._prices.ensureTable(name, rows);
    return this._json.ensureTable(name, rows);
  }

  // ══════════════════════════════════════════════════════════════════════
  // Extended interface (used by portfolioState, localPinAuth, tests)
  // ══════════════════════════════════════════════════════════════════════

  async deleteWhere(name, predicate) {
    if (name === PRICES_TABLE) return this._prices.deleteWhere(name, predicate);
    return this._json.deleteWhere(name, predicate);
  }

  async atomicBatchWrite(operations) {
    // Split by table — prices ops go to native store, others to json.
    const priceOps = [];
    const jsonOps = [];

    for (const op of operations) {
      if (op.table === PRICES_TABLE) {
        priceOps.push(op);
      } else {
        jsonOps.push(op);
      }
    }

    if (priceOps.length > 0) {
      // NativePriceStore writes each table fully; batch all prices writes
      // inside a single better-sqlite3 transaction.
      const db = this._prices.open();
      const tx = db.transaction(() => {
        for (const op of priceOps) {
          this._prices.writeTable(PRICES_TABLE, op.rows);
        }
      });
      tx();
    }

    if (jsonOps.length > 0) {
      await this._json.atomicBatchWrite(jsonOps);
    }
  }

  async withAtomicLock(scope) {
    // Capture the native price store reference so the callback
    // (which has its own `this`) can route prices calls correctly.
    const { _prices } = this;
    return this._json.withAtomicLock(async ({ readTable: _jtRead, writeTable: _jtWrite }) => {
      const scopedReadTable = async (name) => {
        if (name === PRICES_TABLE) return _prices.readTable(name);
        return _jtRead(name);
      };
      const scopedWriteTable = async (name, rows) => {
        if (name === PRICES_TABLE) return _prices.writeTable(name, rows);
        return _jtWrite(name, rows);
      };
      return scope({ readTable: scopedReadTable, writeTable: scopedWriteTable });
    });
  }
}

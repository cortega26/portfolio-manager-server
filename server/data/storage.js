import { promises as fs } from 'fs';
import path from 'path';

import initSqlJs from 'sql.js';

import { atomicWriteFile } from '../utils/atomicStore.js';
import { withLock } from '../utils/locks.js';

const SQLITE_FILE_NAME = 'storage.sqlite';

let sqlModulePromise;
const databasePromiseByPath = new Map();

async function getSqlModule() {
  if (!sqlModulePromise) {
    sqlModulePromise = initSqlJs();
  }
  return sqlModulePromise;
}

function normalizeKeyFields(keyFields) {
  if (!Array.isArray(keyFields)) {
    return [];
  }
  return keyFields.filter((field) => typeof field === 'string' && field.length > 0);
}

function matchByKeyFields(target, candidate, keyFields) {
  return keyFields.every((field) => target?.[field] === candidate?.[field]);
}

function cloneRow(row) {
  if (!row || typeof row !== 'object') {
    return {};
  }
  try {
    return structuredClone(row);
  } catch {
    return JSON.parse(JSON.stringify(row));
  }
}

function cloneRows(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows.map((row) => cloneRow(row));
}

function statementToRowArray(statement) {
  const rows = [];
  while (statement.step()) {
    const next = statement.getAsObject();
    rows.push(JSON.parse(next.row_json));
  }
  return rows;
}

function withTransaction(db, task) {
  db.run('BEGIN');
  try {
    const result = task();
    db.run('COMMIT');
    return result;
  } catch (error) {
    db.run('ROLLBACK');
    throw error;
  }
}

export class JsonTableStorage {
  constructor({ dataDir, logger }) {
    this.dataDir = path.resolve(dataDir);
    this.logger = logger;
    this.databasePath = path.join(this.dataDir, SQLITE_FILE_NAME);
    this.databasePromise = null;
  }

  storageLockKey() {
    return `sqlite-storage:${this.databasePath}`;
  }

  async getDatabase() {
    if (!this.databasePromise) {
      const existing = databasePromiseByPath.get(this.databasePath);
      if (existing) {
        this.databasePromise = existing;
      } else {
        const opened = this.openDatabase().catch((error) => {
          databasePromiseByPath.delete(this.databasePath);
          throw error;
        });
        databasePromiseByPath.set(this.databasePath, opened);
        this.databasePromise = opened;
      }
    }
    return this.databasePromise;
  }

  async openDatabase() {
    await fs.mkdir(this.dataDir, { recursive: true });
    const SQL = await getSqlModule();
    let dbBuffer = null;
    try {
      dbBuffer = await fs.readFile(this.databasePath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
    const db = dbBuffer && dbBuffer.length > 0 ? new SQL.Database(dbBuffer) : new SQL.Database();
    db.run(`
      CREATE TABLE IF NOT EXISTS json_tables (
        table_name TEXT PRIMARY KEY,
        updated_at TEXT NOT NULL
      );
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS json_table_rows (
        table_name TEXT NOT NULL,
        row_index INTEGER NOT NULL,
        row_json TEXT NOT NULL,
        PRIMARY KEY (table_name, row_index),
        FOREIGN KEY (table_name) REFERENCES json_tables(table_name) ON DELETE CASCADE
      );
    `);
    db.run(`
      CREATE INDEX IF NOT EXISTS json_table_rows_lookup
      ON json_table_rows (table_name, row_index);
    `);
    return db;
  }

  async persistDatabase(db) {
    const bytes = db.export();
    await atomicWriteFile(this.databasePath, Buffer.from(bytes));
  }

  hasTableInDatabase(db, name) {
    const statement = db.prepare(
      'SELECT 1 AS present FROM json_tables WHERE table_name = $tableName LIMIT 1',
    );
    try {
      statement.bind({ $tableName: name });
      return statement.step();
    } finally {
      statement.free();
    }
  }

  readTableFromDatabase(db, name) {
    const statement = db.prepare(
      `
        SELECT row_json
        FROM json_table_rows
        WHERE table_name = $tableName
        ORDER BY row_index ASC
      `,
    );
    try {
      statement.bind({ $tableName: name });
      return statementToRowArray(statement);
    } finally {
      statement.free();
    }
  }

  writeTableToDatabase(db, name, rows) {
    const timestamp = new Date().toISOString();
    withTransaction(db, () => {
      db.run('DELETE FROM json_table_rows WHERE table_name = $tableName', {
        $tableName: name,
      });
      db.run(
        `
          INSERT INTO json_tables (table_name, updated_at)
          VALUES ($tableName, $updatedAt)
          ON CONFLICT(table_name) DO UPDATE SET updated_at = excluded.updated_at
        `,
        { $tableName: name, $updatedAt: timestamp },
      );

      if (!Array.isArray(rows) || rows.length === 0) {
        return;
      }

      const insert = db.prepare(
        `
          INSERT INTO json_table_rows (table_name, row_index, row_json)
          VALUES ($tableName, $rowIndex, $rowJson)
        `,
      );
      try {
        rows.forEach((row, index) => {
          insert.run({
            $tableName: name,
            $rowIndex: index,
            $rowJson: JSON.stringify(row),
          });
        });
      } finally {
        insert.free();
      }
    });
  }

  async ensureBootstrap(name, { createIfMissing = false, defaultValue = [] } = {}) {
    const db = await this.getDatabase();
    if (this.hasTableInDatabase(db, name)) {
      return this.readTableFromDatabase(db, name);
    }

    if (!createIfMissing) {
      return [];
    }

    const rows = cloneRows(Array.isArray(defaultValue) ? defaultValue : []);
    this.writeTableToDatabase(db, name, rows);
    await this.persistDatabase(db);
    return rows;
  }

  async ensureTable(name, defaultValue = []) {
    await withLock(this.storageLockKey(), async () => {
      await this.ensureBootstrap(name, { createIfMissing: true, defaultValue });
    });
  }

  async readTable(name) {
    return withLock(this.storageLockKey(), async () => {
      const rows = await this.ensureBootstrap(name, { createIfMissing: false });
      return cloneRows(rows);
    });
  }

  async writeTable(name, rows) {
    await withLock(this.storageLockKey(), async () => {
      const db = await this.getDatabase();
      const nextRows = cloneRows(Array.isArray(rows) ? rows : []);
      this.writeTableToDatabase(db, name, nextRows);
      await this.persistDatabase(db);
    });
  }

  async upsertRow(name, row, keyFields) {
    await withLock(this.storageLockKey(), async () => {
      const db = await this.getDatabase();
      const rows = await this.ensureBootstrap(name, { createIfMissing: true, defaultValue: [] });
      const nextRows = cloneRows(rows);
      const normalizedKeyFields = normalizeKeyFields(keyFields);
      const effectiveKeyFields =
        normalizedKeyFields.length > 0 ? normalizedKeyFields : ['id'];
      const nextRow = cloneRow(row);
      const index = nextRows.findIndex((candidate) =>
        matchByKeyFields(nextRow, candidate, effectiveKeyFields),
      );
      if (index >= 0) {
        nextRows[index] = { ...nextRows[index], ...nextRow };
      } else {
        nextRows.push(nextRow);
      }
      this.writeTableToDatabase(db, name, nextRows);
      await this.persistDatabase(db);
    });
  }

  async deleteWhere(name, predicate) {
    await withLock(this.storageLockKey(), async () => {
      const db = await this.getDatabase();
      const rows = await this.ensureBootstrap(name, { createIfMissing: true, defaultValue: [] });
      const nextRows = rows.filter((row) => !predicate(row)).map((row) => cloneRow(row));
      if (nextRows.length === rows.length) {
        return;
      }
      this.writeTableToDatabase(db, name, nextRows);
      await this.persistDatabase(db);
    });
  }

  /**
   * Write multiple tables atomically inside a single SQLite transaction.
   * Acquires one lock, runs all writes inside one BEGIN…COMMIT, and calls
   * persistDatabase exactly once. If any write fails the whole batch is
   * rolled back — no partial state is ever persisted.
   *
   * Each operation has the shape:
   *   { table: string, rows: unknown[] }
   *
   * Tables that do not yet exist are created automatically (ensureTable).
   *
   * @param {Array<{ table: string, rows: unknown[] }>} operations
   */
  async atomicBatchWrite(operations) {
    if (!Array.isArray(operations) || operations.length === 0) {
      return;
    }
    await withLock(this.storageLockKey(), async () => {
      const db = await this.getDatabase();
      // Ensure all tables exist inside the outer lock so we don't re-acquire.
      for (const { table } of operations) {
        if (!this.hasTableInDatabase(db, table)) {
          // Bootstrap the table with empty rows (idempotent, no-op if exists).
          this.writeTableToDatabase(db, table, []);
        }
      }
      // Single SQLite transaction wraps all table writes.
      withTransaction(db, () => {
        for (const { table, rows } of operations) {
          const nextRows = cloneRows(Array.isArray(rows) ? rows : []);
          // writeTableToDatabase already does DELETE + INSERT via its own
          // withTransaction call, but since we are already inside a transaction
          // here we call the raw SQL helpers directly to avoid nested
          // transactions (SQLite doesn't support them).
          const timestamp = new Date().toISOString();
          db.run('DELETE FROM json_table_rows WHERE table_name = $tableName', {
            $tableName: table,
          });
          db.run(
            `INSERT INTO json_tables (table_name, updated_at)
             VALUES ($tableName, $updatedAt)
             ON CONFLICT(table_name) DO UPDATE SET updated_at = excluded.updated_at`,
            { $tableName: table, $updatedAt: timestamp },
          );
          if (nextRows.length > 0) {
            const insert = db.prepare(
              `INSERT INTO json_table_rows (table_name, row_index, row_json)
               VALUES ($tableName, $rowIndex, $rowJson)`,
            );
            try {
              nextRows.forEach((row, index) => {
                insert.run({
                  $tableName: table,
                  $rowIndex: index,
                  $rowJson: JSON.stringify(row),
                });
              });
            } finally {
              insert.free();
            }
          }
        }
      });
      await this.persistDatabase(db);
    });
  }
}

export default JsonTableStorage;

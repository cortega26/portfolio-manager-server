// @ts-nocheck
import { promises as fs } from 'fs';
import path from 'path';

import { atomicWriteFile } from '../utils/atomicStore.js';
import { withLock } from '../utils/locks.js';

const SNAPSHOT_SUFFIX = '.snapshot.json';
const LOG_SUFFIX = '.log.ndjson';
const MAX_LOG_SIZE_BYTES = 2_000_000;

async function readJson(filePath, fallback) {
  try {
    const contents = await fs.readFile(filePath, 'utf8');
    return JSON.parse(contents);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return fallback;
    }
    throw error;
  }
}

async function writeJson(filePath, value) {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  await atomicWriteFile(filePath, serialized);
}

async function appendJsonLine(filePath, value) {
  const directory = path.dirname(filePath);
  await fs.mkdir(directory, { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(value)}\n`, 'utf8');
}

async function readJsonLines(filePath) {
  try {
    const contents = await fs.readFile(filePath, 'utf8');
    if (!contents) {
      return [];
    }
    return contents
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

function normalizeKeyFields(keyFields) {
  if (!Array.isArray(keyFields)) {
    return [];
  }
  return keyFields.filter((field) => typeof field === 'string' && field.length > 0);
}

function resolveKeyFields(entry) {
  const fields = normalizeKeyFields(entry?.keyFields);
  if (fields.length > 0) {
    return fields;
  }
  return ['id'];
}

function matchByKeyFields(target, candidate, keyFields) {
  return keyFields.every((field) => target?.[field] === candidate?.[field]);
}

function applyLogEntries(baseRows, logEntries) {
  if (!Array.isArray(baseRows)) {
    baseRows = [];
  }
  if (!Array.isArray(logEntries) || logEntries.length === 0) {
    return baseRows;
  }
  const rows = [...baseRows];
  for (const entry of logEntries) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    if (entry.op === 'upsert') {
      const keyFields = resolveKeyFields(entry);
      const row = entry.row && typeof entry.row === 'object' ? entry.row : null;
      if (!row) {
        continue;
      }
      const index = rows.findIndex((candidate) => matchByKeyFields(row, candidate, keyFields));
      if (index >= 0) {
        rows[index] = { ...rows[index], ...row };
      } else {
        rows.push(row);
      }
    }
  }
  return rows;
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

export class JsonTableStorage {
  constructor({ dataDir, logger }) {
    this.dataDir = dataDir;
    this.logger = logger;
  }

  tablePath(name) {
    return path.join(this.dataDir, `${name}.json`);
  }

  tableSnapshotPath(name) {
    return path.join(this.dataDir, `${name}${SNAPSHOT_SUFFIX}`);
  }

  tableLogPath(name) {
    return path.join(this.dataDir, `${name}${LOG_SUFFIX}`);
  }

  tableLockKey(name) {
    return `table:${this.dataDir}:${name}`;
  }

  async readCombinedTable(name) {
    const snapshotPath = this.tableSnapshotPath(name);
    let rows = await readJson(snapshotPath, null);
    if (!Array.isArray(rows)) {
      rows = await readJson(this.tablePath(name), []);
    }
    const logEntries = await readJsonLines(this.tableLogPath(name));
    return applyLogEntries(rows, logEntries);
  }

  async ensureTable(name, defaultValue = []) {
    const filePath = this.tablePath(name);
    try {
      await fs.access(filePath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        await writeJson(filePath, defaultValue);
      } else {
        throw error;
      }
    }
    const snapshotPath = this.tableSnapshotPath(name);
    try {
      await fs.access(snapshotPath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        await writeJson(snapshotPath, defaultValue);
      } else {
        throw error;
      }
    }
  }

  async readTable(name) {
    return this.readCombinedTable(name);
  }

  async writeTable(name, rows) {
    await withLock(this.tableLockKey(name), async () => {
      await this.writeTableUnsafe(name, rows);
    });
  }

  async upsertRow(name, row, keyFields) {
    const logPath = this.tableLogPath(name);
    const entry = {
      op: 'upsert',
      keyFields: normalizeKeyFields(keyFields),
      row: cloneRow(row),
      timestamp: new Date().toISOString(),
    };
    await withLock(this.tableLockKey(name), async () => {
      await appendJsonLine(logPath, entry);
      const stats = await fs
        .stat(logPath)
        .catch((error) => (error.code === 'ENOENT' ? null : Promise.reject(error)));
      if (stats && stats.size > MAX_LOG_SIZE_BYTES) {
        await this.compactTableUnsafe(name);
      }
    });
  }

  async deleteWhere(name, predicate) {
    await withLock(this.tableLockKey(name), async () => {
      const rows = await this.readCombinedTable(name);
      const filtered = rows.filter((row) => !predicate(row));
      if (filtered.length === rows.length) {
        return;
      }
      await this.writeTableUnsafe(name, filtered);
    });
  }

  async writeTableUnsafe(name, rows) {
    const filePath = this.tablePath(name);
    const snapshotPath = this.tableSnapshotPath(name);
    const logPath = this.tableLogPath(name);
    await writeJson(snapshotPath, rows);
    await writeJson(filePath, rows);
    await fs.rm(logPath, { force: true });
  }

  async compactTableUnsafe(name) {
    const rows = await this.readCombinedTable(name);
    await this.writeTableUnsafe(name, rows);
  }
}

export default JsonTableStorage;

import { promises as fs } from 'fs';
import path from 'path';

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
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, serialized, 'utf8');
}

export class JsonTableStorage {
  constructor({ dataDir, logger }) {
    this.dataDir = dataDir;
    this.logger = logger;
  }

  tablePath(name) {
    return path.join(this.dataDir, `${name}.json`);
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
  }

  async readTable(name) {
    const filePath = this.tablePath(name);
    return readJson(filePath, []);
  }

  async writeTable(name, rows) {
    const filePath = this.tablePath(name);
    await writeJson(filePath, rows);
  }

  async upsertRow(name, row, keyFields) {
    const rows = await this.readTable(name);
    const index = rows.findIndex((existing) =>
      keyFields.every((field) => existing[field] === row[field]),
    );
    if (index >= 0) {
      rows[index] = { ...rows[index], ...row };
    } else {
      rows.push(row);
    }
    await this.writeTable(name, rows);
  }

  async deleteWhere(name, predicate) {
    const rows = await this.readTable(name);
    const filtered = rows.filter((row) => !predicate(row));
    await this.writeTable(name, filtered);
  }
}

export default JsonTableStorage;

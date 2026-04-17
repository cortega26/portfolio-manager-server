// server/auth/localPinAuth.ts
import { promisify } from 'node:util';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';

import type { PortfolioId } from '../types/domain.js';

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: string,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>;

const PORTFOLIO_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const PIN_PATTERN = /^\d{4,12}$/;
const PORTFOLIO_PINS_TABLE = 'portfolio_pins';
const SCRYPT_PARAMS = Object.freeze({
  N: 16384,
  r: 8,
  p: 1,
  keylen: 64,
});

// ---------------------------------------------------------------------------
// Storage interface (minimal surface used by auth)
// ---------------------------------------------------------------------------

export interface AuthStorage {
  ensureTable(table: string, rows: unknown[]): Promise<void>;
  readTable<T = Record<string, unknown>>(table: string): Promise<T[]>;
  upsertRow<T extends Record<string, unknown>>(
    table: string,
    row: T,
    keys: string[],
  ): Promise<void>;
}

interface PinRecord {
  portfolio_id?: string;
  pin_hash?: string;
  created_at?: string;
  updated_at?: string;
}

interface PinAuthError extends Error {
  code: string;
}

interface ParsedHash {
  keylen: number;
  salt: string;
  digest: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function createPinAuthError({ code, message }: { code: string; message: string }): PinAuthError {
  const error = new Error(message) as PinAuthError;
  error.code = code;
  return error;
}

function normalizePortfolioId(portfolioId: unknown): string {
  if (typeof portfolioId !== 'string') {
    throw createPinAuthError({
      code: 'INVALID_PORTFOLIO_ID',
      message: 'Portfolio ID must be a string.',
    });
  }
  const normalized = portfolioId.trim();
  if (!PORTFOLIO_ID_PATTERN.test(normalized)) {
    throw createPinAuthError({
      code: 'INVALID_PORTFOLIO_ID',
      message: 'Portfolio ID must match [A-Za-z0-9_-]{1,64}.',
    });
  }
  return normalized;
}

function normalizePin(pin: unknown): string {
  if (typeof pin !== 'string') {
    throw createPinAuthError({
      code: 'INVALID_PIN',
      message: 'PIN must be provided as a string.',
    });
  }
  const normalized = pin.trim();
  if (!PIN_PATTERN.test(normalized)) {
    throw createPinAuthError({
      code: 'INVALID_PIN',
      message: 'PIN must contain 4 to 12 digits.',
    });
  }
  return normalized;
}

function parseStoredHash(pinHash: unknown): ParsedHash | null {
  if (typeof pinHash !== 'string') {
    return null;
  }
  const [algorithm, keylen, salt, digest] = pinHash.split(':');
  if (algorithm !== 'scrypt' || !keylen || !salt || !digest) {
    return null;
  }
  const numericKeylen = Number.parseInt(keylen, 10);
  if (!Number.isFinite(numericKeylen) || numericKeylen <= 0) {
    return null;
  }
  return {
    keylen: numericKeylen,
    salt,
    digest,
  };
}

async function derivePinDigest(
  pin: string,
  salt: string,
  keylen: number = SCRYPT_PARAMS.keylen,
): Promise<string> {
  const derived = await scrypt(pin, salt, keylen, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p,
  });
  return Buffer.from(derived as Buffer).toString('base64');
}

async function readPinRows(storage: AuthStorage): Promise<PinRecord[]> {
  await storage.ensureTable(PORTFOLIO_PINS_TABLE, []);
  return storage.readTable<PinRecord>(PORTFOLIO_PINS_TABLE);
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

export async function getPinRecord(
  storage: AuthStorage,
  portfolioId: PortfolioId,
): Promise<PinRecord | null> {
  const normalizedPortfolioId = normalizePortfolioId(portfolioId);
  const rows = await readPinRows(storage);
  return rows.find((row) => row?.portfolio_id === normalizedPortfolioId) ?? null;
}

export async function hasPin(
  storage: AuthStorage,
  portfolioId: PortfolioId,
): Promise<boolean> {
  const record = await getPinRecord(storage, portfolioId);
  return Boolean(record?.pin_hash);
}

export async function setPin(
  storage: AuthStorage,
  portfolioId: PortfolioId,
  pin: string,
): Promise<{ portfolio_id: string; created_at: string; updated_at: string }> {
  const normalizedPortfolioId = normalizePortfolioId(portfolioId);
  const normalizedPin = normalizePin(pin);
  const existing = await getPinRecord(storage, normalizedPortfolioId);
  const salt = randomBytes(16).toString('base64');
  const digest = await derivePinDigest(normalizedPin, salt, SCRYPT_PARAMS.keylen);
  const now = new Date().toISOString();
  const record = {
    portfolio_id: normalizedPortfolioId,
    pin_hash: `scrypt:${SCRYPT_PARAMS.keylen}:${salt}:${digest}`,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
  await storage.upsertRow(PORTFOLIO_PINS_TABLE, record, ['portfolio_id']);
  return {
    portfolio_id: record.portfolio_id,
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

export async function verifyPin(
  storage: AuthStorage,
  portfolioId: PortfolioId,
  pin: string,
): Promise<boolean> {
  const normalizedPortfolioId = normalizePortfolioId(portfolioId);
  const normalizedPin = normalizePin(pin);
  const record = await getPinRecord(storage, normalizedPortfolioId);
  if (!record?.pin_hash) {
    return false;
  }
  const parsed = parseStoredHash(record.pin_hash);
  if (!parsed) {
    return false;
  }
  const derivedDigest = await derivePinDigest(normalizedPin, parsed.salt, parsed.keylen);
  const storedBuffer = Buffer.from(parsed.digest, 'base64');
  const providedBuffer = Buffer.from(derivedDigest, 'base64');
  if (storedBuffer.length !== providedBuffer.length) {
    return false;
  }
  return timingSafeEqual(storedBuffer, providedBuffer);
}

export { PORTFOLIO_PINS_TABLE, PORTFOLIO_ID_PATTERN, PIN_PATTERN };

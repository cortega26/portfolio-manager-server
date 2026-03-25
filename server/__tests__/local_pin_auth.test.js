import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

import { runMigrations } from "../migrations/index.js";
import {
  getPinRecord,
  hasPin,
  setPin,
  verifyPin,
} from "../auth/localPinAuth.js";

const noopLogger = {
  info() {},
  warn() {},
  error() {},
  child() {
    return this;
  },
};

let dataDir;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), "portfolio-pin-auth-"));
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

test("setPin stores a scrypt hash and verifyPin validates it", async () => {
  const storage = await runMigrations({ dataDir, logger: noopLogger });

  assert.equal(await hasPin(storage, "desktop"), false);

  await setPin(storage, "desktop", "2468");

  assert.equal(await hasPin(storage, "desktop"), true);
  assert.equal(await verifyPin(storage, "desktop", "2468"), true);
  assert.equal(await verifyPin(storage, "desktop", "9999"), false);

  const record = await getPinRecord(storage, "desktop");
  assert.match(record.pin_hash, /^scrypt:\d+:/u);
});

test("setPin rejects non-numeric or short PIN values", async () => {
  const storage = await runMigrations({ dataDir, logger: noopLogger });

  await assert.rejects(
    () => setPin(storage, "desktop", "12ab"),
    (error) => error?.code === "INVALID_PIN",
  );

  await assert.rejects(
    () => setPin(storage, "desktop", "123"),
    (error) => error?.code === "INVALID_PIN",
  );
});

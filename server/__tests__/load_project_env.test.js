import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { test } from "node:test";

import { loadConfig } from "../config.js";
import { loadProjectEnv } from "../runtime/loadProjectEnv.js";

const ENV_KEYS = [
  "PRICE_PROVIDER_LATEST",
  "TWELVE_DATA_API_KEY",
  "TWELVE_DATA_PREPOST",
];

function snapshotEnv(keys) {
  return new Map(keys.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot) {
  for (const [key, value] of snapshot.entries()) {
    if (value === undefined) {
      delete process.env[key];
      continue;
    }
    process.env[key] = value;
  }
}

test("loadProjectEnv loads pricing configuration from a valid env file", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "portfolio-env-"));
  const envFilePath = path.join(tempDir, ".env");
  const snapshot = snapshotEnv(ENV_KEYS);

  try {
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
    await writeFile(
      envFilePath,
      [
        "PRICE_PROVIDER_LATEST=twelvedata",
        "TWELVE_DATA_API_KEY=test-key",
        "TWELVE_DATA_PREPOST=false",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = loadProjectEnv({ envFilePath });
    const config = loadConfig();

    assert.deepEqual(result, {
      loaded: true,
      path: envFilePath,
      reason: "loaded",
    });
    assert.deepEqual(config.prices.latest, {
      provider: "twelvedata",
      apiKey: "test-key",
      prepost: false,
    });
  } finally {
    restoreEnv(snapshot);
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("loadProjectEnv does not fail when the env file is missing", () => {
  const missingPath = path.join(os.tmpdir(), `missing-env-${Date.now()}.env`);
  const result = loadProjectEnv({ envFilePath: missingPath });

  assert.deepEqual(result, {
    loaded: false,
    path: missingPath,
    reason: "missing",
  });
});

test("loadProjectEnv preserves variables already exported in the shell", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "portfolio-env-"));
  const envFilePath = path.join(tempDir, ".env");
  const snapshot = snapshotEnv(ENV_KEYS);

  try {
    process.env.PRICE_PROVIDER_LATEST = "none";
    process.env.TWELVE_DATA_API_KEY = "shell-key";
    delete process.env.TWELVE_DATA_PREPOST;
    await writeFile(
      envFilePath,
      [
        "PRICE_PROVIDER_LATEST=twelvedata",
        "TWELVE_DATA_API_KEY=file-key",
        "TWELVE_DATA_PREPOST=false",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = loadProjectEnv({ envFilePath });
    const config = loadConfig();

    assert.deepEqual(result, {
      loaded: true,
      path: envFilePath,
      reason: "loaded",
    });
    assert.deepEqual(config.prices.latest, {
      provider: "none",
      apiKey: "shell-key",
      prepost: false,
    });
  } finally {
    restoreEnv(snapshot);
    await rm(tempDir, { recursive: true, force: true });
  }
});

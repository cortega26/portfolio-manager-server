import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

import { buildFastifyApp, request, closeApp } from './helpers/fastifyTestApp.js';

const noopLogger = {
  info() {},
  warn() {},
  error() {},
  debug() {},
  trace() {},
  fatal() {},
  child() {
    return this;
  },
};

const SESSION_TOKEN = "desktop-session-token";

let dataDir;

function withSession(requestBuilder, token = SESSION_TOKEN, headerName = "X-Session-Token") {
  return requestBuilder.set(headerName, token);
}

function buildApp(configOverride) {
  return buildFastifyApp({
    dataDir,
    logger: noopLogger,
    config: configOverride,
  });
}

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), "session-auth-"));
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

test("session auth mode requires the configured desktop session token", async () => {
  const app = await buildApp({
    security: {
      auth: {
        mode: "session",
        sessionToken: SESSION_TOKEN,
      },
    },
  });

  const missing = await request(app)
    .get("/api/portfolio/desktop")
    .expect(401);
  assert.equal(missing.body.error, "NO_SESSION_TOKEN");

  const invalid = await withSession(
    request(app).get("/api/portfolio/desktop"),
    "wrong-token",
  ).expect(403);
  assert.equal(invalid.body.error, "INVALID_SESSION_TOKEN");
  await closeApp(app);
});

test("session auth mode persists and retrieves portfolios without portfolio keys", async () => {
  const app = await buildApp({
    security: {
      auth: {
        mode: "session",
        sessionToken: SESSION_TOKEN,
      },
    },
  });

  await withSession(
    request(app)
      .post("/api/portfolio/desktop")
      .send({ transactions: [{ date: "2024-01-01", type: "DEPOSIT", amount: 1000 }] }),
  ).expect(200);

  const response = await withSession(
    request(app).get("/api/portfolio/desktop"),
  ).expect(200);

  assert.equal(response.body.transactions.length, 1);
  assert.equal(response.body.transactions[0].type, "DEPOSIT");
  await closeApp(app);
});

test("session auth mode supports custom header names", async () => {
  const app = await buildApp({
    security: {
      auth: {
        mode: "session",
        sessionToken: SESSION_TOKEN,
        headerName: "X-Desktop-Auth",
      },
    },
  });

  const response = await withSession(
    request(app)
      .post("/api/portfolio/custom-header")
      .send({ transactions: [] }),
    SESSION_TOKEN,
    "X-Desktop-Auth",
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: "ok" });
  await closeApp(app);
});

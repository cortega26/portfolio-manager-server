import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, test } from "node:test";
import request from "supertest";

import { startServer } from "../runtime/startServer.js";
import { createSessionTestApp } from "./sessionTestUtils.js";

const noopLogger = {
  info() {},
  warn() {},
  error() {},
  child() {
    return this;
  },
};

let dataDir;
let staticDir;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), "spa-shell-data-"));
  staticDir = mkdtempSync(path.join(tmpdir(), "spa-shell-static-"));
  writeFileSync(
    path.join(staticDir, "index.html"),
    "<!doctype html><html><body><div id=\"root\">desktop-shell</div></body></html>",
    "utf8",
  );
  writeFileSync(
    path.join(staticDir, "asset.js"),
    "console.log('desktop-shell-asset');",
    "utf8",
  );
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(staticDir, { recursive: true, force: true });
});

test("SPA shell serves index fallback without intercepting API routes", async () => {
  const app = createSessionTestApp({
    dataDir,
    logger: noopLogger,
    staticDir,
    spaFallback: true,
  });

  const rootResponse = await request(app)
    .get("/")
    .set("Accept", "text/html")
    .expect(200);
  assert.match(rootResponse.text, /desktop-shell/u);

  const clientRouteResponse = await request(app)
    .get("/admin/local")
    .set("Accept", "text/html")
    .expect(200);
  assert.match(clientRouteResponse.text, /desktop-shell/u);

  await request(app)
    .get("/asset.js")
    .expect(200)
    .expect("Content-Type", /javascript/u);

  const apiResponse = await request(app)
    .get("/api/portfolio/desktop")
    .set("Accept", "text/html")
    .expect(401);
  assert.equal(apiResponse.body.error, "NO_SESSION_TOKEN");

  await request(app)
    .get("/missing.js")
    .set("Accept", "*/*")
    .expect(404);
});

test("same-origin asset requests remain allowed when SPA shell runs on loopback", async () => {
  const server = await startServer({
    host: "127.0.0.1",
    port: 0,
    staticDir,
    spaFallback: true,
    config: {
      dataDir,
      featureFlags: { cashBenchmarks: true },
      cors: { allowedOrigins: [] },
      security: {},
    },
    logger: noopLogger,
  });

  try {
    const response = await fetch(`${server.baseUrl}/asset.js`, {
      headers: {
        Origin: server.baseUrl,
      },
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /javascript/u);
  } finally {
    await server.close();
  }
});

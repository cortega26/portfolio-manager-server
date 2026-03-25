import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveSchedulerEnabled } from "../runtime/startServer.js";

test("resolveSchedulerEnabled honors explicit overrides before config", () => {
  assert.equal(
    resolveSchedulerEnabled(false, { jobs: { nightlyEnabled: true } }),
    false,
  );
  assert.equal(
    resolveSchedulerEnabled(true, { jobs: { nightlyEnabled: false } }),
    true,
  );
});

test("resolveSchedulerEnabled falls back to config when no override is provided", () => {
  assert.equal(
    resolveSchedulerEnabled(undefined, { jobs: { nightlyEnabled: false } }),
    false,
  );
  assert.equal(
    resolveSchedulerEnabled(undefined, { jobs: { nightlyEnabled: true } }),
    true,
  );
});

test("resolveSchedulerEnabled defaults to enabled when config is missing", () => {
  assert.equal(resolveSchedulerEnabled(undefined, {}), true);
  assert.equal(resolveSchedulerEnabled(undefined, null), true);
});

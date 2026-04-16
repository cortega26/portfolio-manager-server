import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

import JsonTableStorage from "../data/storage.js";
import {
  getSignalNotificationEmailDeliveryEligibility,
  createSignalNotificationMailer,
  processPendingSignalNotificationEmails,
  requeueSignalNotificationEmailDelivery,
} from "../services/signalNotificationEmail.js";

const noopLogger = { info() {}, warn() {}, error() {} };

let dataDir;
let storage;

function buildNotification({
  id = "notification-1",
  status = "BUY_ZONE",
  deliveryStatus = "pending",
  attempts = 0,
  lastAttemptAt = null,
  nextRetryAt = null,
  portfolioId = "portfolio-1",
} = {}) {
  return {
    id,
    portfolio_id: portfolioId,
    ticker: "AAPL",
    status,
    previous_status: "HOLD",
    pct_window: 5,
    current_price: 94,
    current_price_as_of: "2024-01-03",
    lower_bound: 95,
    upper_bound: 105,
    reference_price: 100,
    reference_date: "2024-01-02",
    reference_type: "BUY",
    sanity_rejected: false,
    source: "daily_close",
    created_at: "2024-01-03T10:00:00.000Z",
    acknowledged_at: null,
    channels: {
      email: true,
    },
    delivery: {
      email: {
        status: deliveryStatus,
        attempts,
        lastAttemptAt,
        deliveredAt: deliveryStatus === "delivered"
          ? "2024-01-03T10:05:00.000Z"
          : null,
        nextRetryAt,
        exhaustedAt: deliveryStatus === "exhausted"
          ? "2024-01-03T12:00:00.000Z"
          : null,
        requeuedAt: null,
        failure: null,
        messageId: deliveryStatus === "delivered" ? "msg-123" : null,
      },
    },
  };
}

beforeEach(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), "signal-email-test-"));
  storage = new JsonTableStorage({ dataDir, logger: noopLogger });
  await storage.ensureTable("signal_notifications", []);
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

test("createSignalNotificationMailer sends concise signal emails through the configured transport", async () => {
  const sentMessages = [];
  const transport = {
    async sendMail(message) {
      sentMessages.push(message);
      return { messageId: "msg-123" };
    },
  };
  const mailer = createSignalNotificationMailer({
    config: {
      notifications: {
        emailDelivery: {
          enabled: true,
          configured: true,
          from: "alerts@example.com",
          to: ["investor@example.com"],
          replyTo: "support@example.com",
          subjectPrefix: "[Signals]",
          transport: {
            host: "127.0.0.1",
            port: 1025,
            secure: false,
            auth: {},
          },
        },
      },
    },
    transport,
  });

  await mailer.sendSignalNotification(buildNotification());

  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].from, "alerts@example.com");
  assert.equal(sentMessages[0].to, "investor@example.com");
  assert.equal(sentMessages[0].replyTo, "support@example.com");
  assert.match(sentMessages[0].subject, /\[Signals\] Buy zone: AAPL/);
  assert.match(sentMessages[0].text, /Buy zone detected for AAPL\./);
  assert.match(sentMessages[0].text, /Current price: 94.00/);
  assert.match(sentMessages[0].text, /Signal window: 5%/);
});

test("processPendingSignalNotificationEmails records failures and ignores non-pending rows", async () => {
  await storage.upsertRow(
    "signal_notifications",
    buildNotification({ id: "pending-1", deliveryStatus: "pending" }),
    ["id"],
  );
  await storage.upsertRow(
    "signal_notifications",
    buildNotification({
      id: "delivered-1",
      deliveryStatus: "delivered",
      attempts: 1,
    }),
    ["id"],
  );

  const attempted = [];
  const result = await processPendingSignalNotificationEmails({
    storage,
    config: {
      notifications: {
        emailDelivery: {
          retry: {
            maxAttempts: 3,
            minDelayMs: 60_000,
            backoffMultiplier: 2,
            automaticRetries: true,
          },
        },
      },
    },
    logger: noopLogger,
    now: "2024-01-03T12:00:00.000Z",
    mailer: {
      enabled: true,
      configured: true,
      async sendSignalNotification(notification) {
        attempted.push(notification.id);
        throw Object.assign(new Error("SMTP unavailable"), {
          code: "ECONNREFUSED",
        });
      },
    },
  });

  assert.deepEqual(attempted, ["pending-1"]);
  assert.deepEqual(result, {
    attempted: 1,
    delivered: 0,
    failed: 1,
    exhausted: 0,
    skipped: null,
  });

  const notifications = await storage.readTable("signal_notifications");
  const failed = notifications.find((row) => row.id === "pending-1");
  const delivered = notifications.find((row) => row.id === "delivered-1");

  assert.equal(failed.delivery.email.status, "failed");
  assert.equal(failed.delivery.email.attempts, 1);
  assert.equal(failed.delivery.email.lastAttemptAt, "2024-01-03T12:00:00.000Z");
  assert.equal(failed.delivery.email.deliveredAt, null);
  assert.equal(failed.delivery.email.nextRetryAt, "2024-01-03T12:01:00.000Z");
  assert.deepEqual(failed.delivery.email.failure, {
    at: "2024-01-03T12:00:00.000Z",
    code: "ECONNREFUSED",
    message: "SMTP unavailable",
    attempt: 1,
    terminal: false,
  });
  assert.equal(delivered.delivery.email.status, "delivered");
  assert.equal(delivered.delivery.email.attempts, 1);
});

test("failed signal notification emails become eligible for retry only after the persisted retry timestamp", () => {
  const retryPolicy = {
    maxAttempts: 3,
    minDelayMs: 60_000,
    backoffMultiplier: 2,
    automaticRetries: true,
  };
  const failedNotification = buildNotification({
    deliveryStatus: "failed",
    attempts: 1,
    lastAttemptAt: "2024-01-03T12:00:00.000Z",
  });

  assert.deepEqual(
    getSignalNotificationEmailDeliveryEligibility(failedNotification, {
      now: "2024-01-03T12:00:30.000Z",
      retryPolicy,
    }),
    {
      eligible: false,
      reason: "retry_delay_pending",
      nextRetryAt: "2024-01-03T12:01:00.000Z",
    },
  );
  assert.deepEqual(
    getSignalNotificationEmailDeliveryEligibility(failedNotification, {
      now: "2024-01-03T12:01:00.000Z",
      retryPolicy,
    }),
    {
      eligible: true,
      reason: "retry_due",
      nextRetryAt: "2024-01-03T12:01:00.000Z",
    },
  );
});

test("processPendingSignalNotificationEmails retries eligible failed rows and marks them delivered once", async () => {
  await storage.upsertRow(
    "signal_notifications",
    buildNotification({
      id: "failed-1",
      deliveryStatus: "failed",
      attempts: 1,
      lastAttemptAt: "2024-01-03T12:00:00.000Z",
      nextRetryAt: "2024-01-03T12:01:00.000Z",
    }),
    ["id"],
  );

  const attempted = [];
  const result = await processPendingSignalNotificationEmails({
    storage,
    config: {
      notifications: {
        emailDelivery: {
          retry: {
            maxAttempts: 3,
            minDelayMs: 60_000,
            backoffMultiplier: 2,
            automaticRetries: true,
          },
        },
      },
    },
    logger: noopLogger,
    now: "2024-01-03T12:02:00.000Z",
    mailer: {
      enabled: true,
      configured: true,
      async sendSignalNotification(notification) {
        attempted.push(notification.id);
        return { messageId: "msg-retry-1" };
      },
    },
  });

  assert.deepEqual(attempted, ["failed-1"]);
  assert.deepEqual(result, {
    attempted: 1,
    delivered: 1,
    failed: 0,
    exhausted: 0,
    skipped: null,
  });

  const notifications = await storage.readTable("signal_notifications");
  const delivered = notifications.find((row) => row.id === "failed-1");
  assert.equal(delivered.delivery.email.status, "delivered");
  assert.equal(delivered.delivery.email.attempts, 2);
  assert.equal(delivered.delivery.email.lastAttemptAt, "2024-01-03T12:02:00.000Z");
  assert.equal(delivered.delivery.email.deliveredAt, "2024-01-03T12:02:00.000Z");
  assert.equal(delivered.delivery.email.nextRetryAt, null);
  assert.equal(delivered.delivery.email.failure, null);
  assert.equal(delivered.delivery.email.messageId, "msg-retry-1");

  const secondPass = await processPendingSignalNotificationEmails({
    storage,
    config: {
      notifications: {
        emailDelivery: {
          retry: {
            maxAttempts: 3,
            minDelayMs: 60_000,
            backoffMultiplier: 2,
            automaticRetries: true,
          },
        },
      },
    },
    logger: noopLogger,
    now: "2024-01-03T12:03:00.000Z",
    mailer: {
      enabled: true,
      configured: true,
      async sendSignalNotification() {
        throw new Error("should not send twice");
      },
    },
  });

  assert.deepEqual(secondPass, {
    attempted: 0,
    delivered: 0,
    failed: 0,
    exhausted: 0,
    skipped: null,
  });
});

test("processPendingSignalNotificationEmails moves rows to exhausted when retry attempts are exhausted", async () => {
  await storage.upsertRow(
    "signal_notifications",
    buildNotification({
      id: "failed-terminal",
      deliveryStatus: "failed",
      attempts: 2,
      lastAttemptAt: "2024-01-03T12:00:00.000Z",
      nextRetryAt: "2024-01-03T12:02:00.000Z",
    }),
    ["id"],
  );

  const result = await processPendingSignalNotificationEmails({
    storage,
    config: {
      notifications: {
        emailDelivery: {
          retry: {
            maxAttempts: 3,
            minDelayMs: 60_000,
            backoffMultiplier: 2,
            automaticRetries: true,
          },
        },
      },
    },
    logger: noopLogger,
    now: "2024-01-03T12:03:00.000Z",
    mailer: {
      enabled: true,
      configured: true,
      async sendSignalNotification() {
        throw Object.assign(new Error("Still unavailable"), { code: "ETIMEDOUT" });
      },
    },
  });

  assert.deepEqual(result, {
    attempted: 1,
    delivered: 0,
    failed: 0,
    exhausted: 1,
    skipped: null,
  });

  const notifications = await storage.readTable("signal_notifications");
  const exhausted = notifications.find((row) => row.id === "failed-terminal");
  assert.equal(exhausted.delivery.email.status, "exhausted");
  assert.equal(exhausted.delivery.email.attempts, 3);
  assert.equal(exhausted.delivery.email.nextRetryAt, null);
  assert.equal(exhausted.delivery.email.exhaustedAt, "2024-01-03T12:03:00.000Z");
  assert.deepEqual(exhausted.delivery.email.failure, {
    at: "2024-01-03T12:03:00.000Z",
    code: "ETIMEDOUT",
    message: "Still unavailable",
    attempt: 3,
    terminal: true,
  });
});

test("requeueSignalNotificationEmailDelivery moves exhausted rows back to pending on the same record", async () => {
  await storage.upsertRow(
    "signal_notifications",
    buildNotification({
      id: "exhausted-1",
      portfolioId: "portfolio-2",
      deliveryStatus: "exhausted",
      attempts: 3,
      lastAttemptAt: "2024-01-03T12:03:00.000Z",
    }),
    ["id"],
  );

  const result = await requeueSignalNotificationEmailDelivery({
    storage,
    portfolioId: "portfolio-2",
    notificationId: "exhausted-1",
    now: "2024-01-03T13:00:00.000Z",
  });

  assert.equal(result.changed, true);
  assert.equal(result.reason, "requeued");
  assert.equal(result.notification.id, "exhausted-1");
  assert.equal(result.notification.delivery.email.status, "pending");
  assert.equal(result.notification.delivery.email.requeuedAt, "2024-01-03T13:00:00.000Z");
  assert.equal(result.notification.delivery.email.nextRetryAt, null);
  assert.equal(result.notification.delivery.email.exhaustedAt, null);

  const notifications = await storage.readTable("signal_notifications");
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].id, "exhausted-1");
  assert.equal(notifications[0].delivery.email.status, "pending");
});

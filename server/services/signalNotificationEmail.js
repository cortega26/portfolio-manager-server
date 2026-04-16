import nodemailer from "nodemailer";

import { SIGNAL_NOTIFICATION_EVENT_TABLE } from "./signalNotifications.js";
import { withLock } from "../utils/locks.js";

const EMAIL_DELIVERY_STATUS = Object.freeze({
  PENDING: "pending",
  DISABLED: "disabled",
  DELIVERED: "delivered",
  FAILED: "failed",
  EXHAUSTED: "exhausted",
});

function normalizeOptionalString(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : fallback;
}

function normalizeAddressList(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeOptionalString(entry))
      .filter(Boolean);
  }
  return [];
}

function normalizePositiveInteger(value, fallback, minimum = 1) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(minimum, parsed);
}

function normalizeNonNegativeInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, parsed);
}

export function normalizeEmailDeliveryRetryPolicy(config) {
  const raw = config?.notifications?.emailDelivery?.retry ?? config?.retry ?? {};
  return {
    maxAttempts: normalizePositiveInteger(raw?.maxAttempts, 3),
    minDelayMs: normalizeNonNegativeInteger(raw?.minDelayMs, 60 * 60 * 1000),
    backoffMultiplier: normalizePositiveInteger(raw?.backoffMultiplier, 2),
    automaticRetries: Boolean(raw?.automaticRetries ?? true),
  };
}

function normalizeEmailDeliveryConfig(config) {
  const raw = config?.notifications?.emailDelivery ?? {};
  const transport = raw?.transport ?? {};
  const normalized = {
    enabled: Boolean(raw?.enabled),
    configured: Boolean(raw?.configured),
    from: normalizeOptionalString(raw?.from),
    to: normalizeAddressList(raw?.to),
    replyTo: normalizeOptionalString(raw?.replyTo),
    subjectPrefix: normalizeOptionalString(
      raw?.subjectPrefix,
      "[Portfolio Manager]",
    ),
    retry: normalizeEmailDeliveryRetryPolicy(raw),
    transport: {
      connectionUrl: normalizeOptionalString(transport?.connectionUrl),
      host: normalizeOptionalString(transport?.host),
      port: Number.isFinite(Number(transport?.port))
        ? Number(transport.port)
        : 587,
      secure: Boolean(transport?.secure),
      auth: {
        user: normalizeOptionalString(transport?.auth?.user),
        pass: normalizeOptionalString(transport?.auth?.pass),
      },
    },
  };
  const inferredConfigured = Boolean(
    normalized.enabled
      && normalized.from
      && normalized.to.length > 0
      && (
        normalized.transport.connectionUrl
        || normalized.transport.host
      ),
  );
  return {
    ...normalized,
    configured: normalized.configured || inferredConfigured,
  };
}

function buildTransportOptions(emailConfig) {
  if (!emailConfig?.configured) {
    return null;
  }
  if (emailConfig.transport.connectionUrl) {
    return emailConfig.transport.connectionUrl;
  }
  const auth = {};
  if (emailConfig.transport.auth.user) {
    auth.user = emailConfig.transport.auth.user;
  }
  if (emailConfig.transport.auth.pass) {
    auth.pass = emailConfig.transport.auth.pass;
  }
  return {
    host: emailConfig.transport.host,
    port: emailConfig.transport.port,
    secure: emailConfig.transport.secure,
    auth: Object.keys(auth).length > 0 ? auth : undefined,
  };
}

function formatNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "n/a";
  }
  return numeric.toFixed(2);
}

function describeSignalStatus(status) {
  if (status === "BUY_ZONE") {
    return "Buy zone";
  }
  if (status === "TRIM_ZONE") {
    return "Trim zone";
  }
  return status ?? "Signal";
}

function buildSubject(notification, emailConfig) {
  const prefix = normalizeOptionalString(
    emailConfig?.subjectPrefix,
    "[Portfolio Manager]",
  );
  const label = describeSignalStatus(notification?.status);
  const ticker = normalizeOptionalString(notification?.ticker, "Unknown");
  const portfolioId = normalizeOptionalString(notification?.portfolio_id);
  const portfolioSuffix = portfolioId ? ` (${portfolioId})` : "";
  return `${prefix} ${label}: ${ticker}${portfolioSuffix}`;
}

function buildTextBody(notification) {
  const lines = [
    `${describeSignalStatus(notification?.status)} detected for ${notification?.ticker ?? "unknown ticker"}.`,
  ];
  if (notification?.portfolio_id) {
    lines.push(`Portfolio: ${notification.portfolio_id}`);
  }
  lines.push(`Current price: ${formatNumber(notification?.current_price)}`);
  if (notification?.current_price_as_of) {
    lines.push(`Price as of: ${notification.current_price_as_of}`);
  }
  lines.push(`Reference price: ${formatNumber(notification?.reference_price)}`);
  if (notification?.reference_date) {
    lines.push(`Reference date: ${notification.reference_date}`);
  }
  if (notification?.reference_type) {
    lines.push(`Reference type: ${notification.reference_type}`);
  }
  if (Number.isFinite(Number(notification?.pct_window))) {
    lines.push(`Signal window: ${Number(notification.pct_window)}%`);
  }
  if (notification?.previous_status) {
    lines.push(`Previous status: ${notification.previous_status}`);
  }
  lines.push("");
  lines.push("Generated by the local desktop portfolio app.");
  return lines.join("\n");
}

function normalizeAttempts(value) {
  const parsed = Number.parseInt(String(value ?? 0), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function buildFailureDetails(error, attemptedAt) {
  return {
    at: attemptedAt,
    code: normalizeOptionalString(error?.code, null),
    message: normalizeOptionalString(
      error?.message,
      "Failed to deliver signal notification email.",
    ),
  };
}

function parseTimestamp(value) {
  if (typeof value !== "string") {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildIsoTimestamp(timestamp) {
  if (!Number.isFinite(timestamp)) {
    return null;
  }
  return new Date(timestamp).toISOString();
}

function computeRetryDelayMs({ attempts, retryPolicy }) {
  const normalizedAttempts = Math.max(1, normalizeAttempts(attempts));
  const multiplier = retryPolicy.backoffMultiplier ** Math.max(0, normalizedAttempts - 1);
  return retryPolicy.minDelayMs * multiplier;
}

function computeNextRetryAt({ attemptedAt, attempts, retryPolicy }) {
  const attemptedTimestamp = parseTimestamp(attemptedAt);
  if (attemptedTimestamp === null) {
    return null;
  }
  return buildIsoTimestamp(
    attemptedTimestamp + computeRetryDelayMs({ attempts, retryPolicy }),
  );
}

function resolveRetryEligibilityAt(notification, retryPolicy) {
  const persistedNextRetryAt = normalizeOptionalString(
    notification?.delivery?.email?.nextRetryAt,
    null,
  );
  if (persistedNextRetryAt) {
    return persistedNextRetryAt;
  }
  const lastAttemptAt = normalizeOptionalString(
    notification?.delivery?.email?.lastAttemptAt,
    null,
  );
  if (!lastAttemptAt) {
    return null;
  }
  return computeNextRetryAt({
    attemptedAt: lastAttemptAt,
    attempts: notification?.delivery?.email?.attempts,
    retryPolicy,
  });
}

function shouldTreatAsExhausted(notification, retryPolicy) {
  return normalizeAttempts(notification?.delivery?.email?.attempts) >= retryPolicy.maxAttempts;
}

export function getSignalNotificationEmailDeliveryEligibility(
  notification,
  { now = new Date().toISOString(), retryPolicy } = {},
) {
  const effectiveRetryPolicy = normalizeEmailDeliveryRetryPolicy({ retry: retryPolicy });
  const deliveryStatus = notification?.delivery?.email?.status;
  if (notification?.channels?.email !== true) {
    return { eligible: false, reason: "channel_disabled", nextRetryAt: null };
  }
  if (deliveryStatus === EMAIL_DELIVERY_STATUS.DELIVERED) {
    return { eligible: false, reason: "already_delivered", nextRetryAt: null };
  }
  if (deliveryStatus === EMAIL_DELIVERY_STATUS.DISABLED) {
    return { eligible: false, reason: "delivery_disabled", nextRetryAt: null };
  }
  if (deliveryStatus === EMAIL_DELIVERY_STATUS.EXHAUSTED) {
    return { eligible: false, reason: "terminal_exhausted", nextRetryAt: null };
  }
  if (shouldTreatAsExhausted(notification, effectiveRetryPolicy)) {
    return {
      eligible: false,
      reason: "attempt_limit_reached",
      nextRetryAt: null,
      shouldExhaust: true,
    };
  }
  if (deliveryStatus === EMAIL_DELIVERY_STATUS.PENDING) {
    return { eligible: true, reason: "pending", nextRetryAt: null };
  }
  if (deliveryStatus !== EMAIL_DELIVERY_STATUS.FAILED) {
    return { eligible: false, reason: "unsupported_status", nextRetryAt: null };
  }
  if (!effectiveRetryPolicy.automaticRetries) {
    return { eligible: false, reason: "automatic_retry_disabled", nextRetryAt: null };
  }
  const nextRetryAt = resolveRetryEligibilityAt(notification, effectiveRetryPolicy);
  if (!nextRetryAt) {
    return { eligible: true, reason: "retry_due", nextRetryAt: null };
  }
  const nextRetryTimestamp = parseTimestamp(nextRetryAt);
  const nowTimestamp = parseTimestamp(now);
  if (
    nextRetryTimestamp === null
    || nowTimestamp === null
    || nextRetryTimestamp <= nowTimestamp
  ) {
    return { eligible: true, reason: "retry_due", nextRetryAt };
  }
  return { eligible: false, reason: "retry_delay_pending", nextRetryAt };
}

function buildUpdatedNotificationRow(notification, deliveryPatch) {
  return {
    ...notification,
    delivery: {
      ...(notification?.delivery ?? {}),
      email: {
        ...(notification?.delivery?.email ?? {}),
        ...deliveryPatch,
      },
    },
  };
}

function buildDeliveryLockKey(storage) {
  const databasePath = normalizeOptionalString(storage?.databasePath, "unknown");
  return `signal-notification-email-delivery:${databasePath}`;
}

export function createSignalNotificationMailer({
  config,
  logger,
  transport,
} = {}) {
  const emailConfig = normalizeEmailDeliveryConfig(config);
  let activeTransport = transport ?? null;
  let ownsTransport = false;

  function ensureTransport() {
    if (!emailConfig.enabled) {
      throw new Error("Email delivery is disabled.");
    }
    if (!emailConfig.configured) {
      throw new Error("Email delivery is not configured.");
    }
    if (!activeTransport) {
      activeTransport = nodemailer.createTransport(
        buildTransportOptions(emailConfig),
      );
      ownsTransport = true;
    }
    return activeTransport;
  }

  return {
    enabled: emailConfig.enabled,
    configured: emailConfig.configured,
    async sendSignalNotification(notification) {
      const mailTransport = ensureTransport();
      const message = {
        from: emailConfig.from,
        to: emailConfig.to.join(", "),
        subject: buildSubject(notification, emailConfig),
        text: buildTextBody(notification),
      };
      if (emailConfig.replyTo) {
        message.replyTo = emailConfig.replyTo;
      }
      logger?.info?.("signal_notification_email_sending", {
        id: notification?.id,
        ticker: notification?.ticker,
        portfolio_id: notification?.portfolio_id ?? null,
      });
      return mailTransport.sendMail(message);
    },
    async close() {
      if (ownsTransport && typeof activeTransport?.close === "function") {
        activeTransport.close();
      }
    },
  };
}

export async function requeueSignalNotificationEmailDelivery({
  storage,
  portfolioId,
  notificationId,
  now = new Date().toISOString(),
} = {}) {
  if (!storage) {
    throw new Error(
      "requeueSignalNotificationEmailDelivery requires a storage instance.",
    );
  }
  const normalizedNotificationId = normalizeOptionalString(notificationId, null);
  if (!normalizedNotificationId) {
    throw new Error(
      "requeueSignalNotificationEmailDelivery requires a notification id.",
    );
  }

  return withLock(buildDeliveryLockKey(storage), async () => {
    const notifications = await storage.readTable(SIGNAL_NOTIFICATION_EVENT_TABLE);
    const target = notifications.find(
      (row) =>
        row?.id === normalizedNotificationId
        && normalizeOptionalString(row?.portfolio_id, null)
          === normalizeOptionalString(portfolioId, null),
    );
    if (!target) {
      return null;
    }
    if (target?.channels?.email !== true) {
      return {
        changed: false,
        reason: "channel_disabled",
        notification: target,
      };
    }
    if (target?.delivery?.email?.status === EMAIL_DELIVERY_STATUS.DELIVERED) {
      return {
        changed: false,
        reason: "already_delivered",
        notification: target,
      };
    }
    if (target?.delivery?.email?.status === EMAIL_DELIVERY_STATUS.PENDING) {
      return {
        changed: false,
        reason: "already_pending",
        notification: target,
      };
    }

    const updatedNotification = buildUpdatedNotificationRow(target, {
      status: EMAIL_DELIVERY_STATUS.PENDING,
      nextRetryAt: null,
      exhaustedAt: null,
      requeuedAt: now,
      deliveredAt: null,
      messageId: null,
    });
    await storage.upsertRow(
      SIGNAL_NOTIFICATION_EVENT_TABLE,
      updatedNotification,
      ["id"],
    );
    return {
      changed: true,
      reason: "requeued",
      notification: updatedNotification,
    };
  });
}

export async function processPendingSignalNotificationEmails({
  storage,
  config,
  logger,
  now = new Date().toISOString(),
  mailer,
} = {}) {
  if (!storage) {
    throw new Error(
      "processPendingSignalNotificationEmails requires a storage instance.",
    );
  }

  const effectiveMailer = mailer ?? createSignalNotificationMailer({ config, logger });
  if (!effectiveMailer.enabled) {
    return {
      attempted: 0,
      delivered: 0,
      failed: 0,
      exhausted: 0,
      skipped: "disabled",
    };
  }
  if (!effectiveMailer.configured) {
    logger?.warn?.("signal_notification_email_not_configured", {
      reason: "missing_transport_or_addresses",
    });
    return {
      attempted: 0,
      delivered: 0,
      failed: 0,
      exhausted: 0,
      skipped: "not_configured",
    };
  }

  try {
    return await withLock(buildDeliveryLockKey(storage), async () => {
      const notifications = await storage.readTable(SIGNAL_NOTIFICATION_EVENT_TABLE);
      const retryPolicy = normalizeEmailDeliveryRetryPolicy(config);
      const plannedNotifications = notifications.map((notification) => ({
        notification,
        eligibility: getSignalNotificationEmailDeliveryEligibility(notification, {
          now,
          retryPolicy,
        }),
      }));
      const eligibleNotifications = plannedNotifications.filter(
        ({ eligibility }) => eligibility.eligible,
      );
      let delivered = 0;
      let failed = 0;
      let exhausted = 0;

      for (const { notification, eligibility } of plannedNotifications) {
        if (eligibility?.shouldExhaust) {
          await storage.upsertRow(
            SIGNAL_NOTIFICATION_EVENT_TABLE,
            buildUpdatedNotificationRow(notification, {
              status: EMAIL_DELIVERY_STATUS.EXHAUSTED,
              nextRetryAt: null,
              exhaustedAt:
                normalizeOptionalString(notification?.delivery?.email?.exhaustedAt, null)
                ?? now,
            }),
            ["id"],
          );
          exhausted += 1;
        }
      }

      for (const { notification } of eligibleNotifications) {
        const attemptedAt = now;
        const nextAttempts =
          normalizeAttempts(notification?.delivery?.email?.attempts) + 1;

        try {
          const result = await effectiveMailer.sendSignalNotification(notification);
          await storage.upsertRow(
            SIGNAL_NOTIFICATION_EVENT_TABLE,
            buildUpdatedNotificationRow(notification, {
              status: EMAIL_DELIVERY_STATUS.DELIVERED,
              attempts: nextAttempts,
              lastAttemptAt: attemptedAt,
              deliveredAt: attemptedAt,
              nextRetryAt: null,
              exhaustedAt: null,
              failure: null,
              messageId: normalizeOptionalString(result?.messageId, null),
            }),
            ["id"],
          );
          delivered += 1;
        } catch (error) {
          logger?.error?.("signal_notification_email_failed", {
            id: notification?.id,
            ticker: notification?.ticker,
            error: error.message,
          });
          await storage.upsertRow(
            SIGNAL_NOTIFICATION_EVENT_TABLE,
            buildUpdatedNotificationRow(notification, {
              status:
                nextAttempts >= retryPolicy.maxAttempts
                  ? EMAIL_DELIVERY_STATUS.EXHAUSTED
                  : EMAIL_DELIVERY_STATUS.FAILED,
              attempts: nextAttempts,
              lastAttemptAt: attemptedAt,
              deliveredAt: null,
              nextRetryAt:
                nextAttempts >= retryPolicy.maxAttempts
                  ? null
                  : computeNextRetryAt({
                    attemptedAt,
                    attempts: nextAttempts,
                    retryPolicy,
                  }),
              exhaustedAt:
                nextAttempts >= retryPolicy.maxAttempts ? attemptedAt : null,
              failure: {
                ...buildFailureDetails(error, attemptedAt),
                attempt: nextAttempts,
                terminal: nextAttempts >= retryPolicy.maxAttempts,
              },
              messageId: null,
            }),
            ["id"],
          );
          if (nextAttempts >= retryPolicy.maxAttempts) {
            exhausted += 1;
          } else {
            failed += 1;
          }
        }
      }

      return {
        attempted: eligibleNotifications.length,
        delivered,
        failed,
        exhausted,
        skipped: null,
      };
    });
  } finally {
    await effectiveMailer.close?.();
  }
}

export { EMAIL_DELIVERY_STATUS };

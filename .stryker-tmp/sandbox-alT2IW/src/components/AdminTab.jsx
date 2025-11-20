// @ts-nocheck
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  fetchMonitoringSnapshot,
  fetchNavSnapshots,
  fetchSecurityEvents,
  fetchSecurityStats,
} from "../utils/api.js";
import { buildSecurityEventsCsv, triggerCsvDownload } from "../utils/reports.js";
import { useI18n } from "../i18n/I18nProvider.jsx";

const DEFAULT_EVENT_LIMIT = 50;
const DEFAULT_POLL_INTERVAL_MS = 15000;

function formatBytes(bytes, t) {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "—";
  }
  const megabytes = bytes / 1024 / 1024;
  if (!Number.isFinite(megabytes)) {
    return "—";
  }
  return t("admin.metrics.format.megabytes", { value: megabytes.toFixed(1) });
}

function formatDuration(seconds, t) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "—";
  }

  const totalSeconds = Math.floor(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const parts = [];

  if (days > 0) {
    parts.push(t("admin.metrics.duration.days", { value: days }));
  }
  if (hours % 24 > 0) {
    parts.push(t("admin.metrics.duration.hours", { value: hours % 24 }));
  }
  if (minutes % 60 > 0 && parts.length < 2) {
    parts.push(t("admin.metrics.duration.minutes", { value: minutes % 60 }));
  }
  if (parts.length === 0) {
    parts.push(t("admin.metrics.duration.seconds", { value: totalSeconds }));
  }

  return parts.join(" ");
}

function buildSystemMetrics(snapshot, t) {
  if (!snapshot) {
    return [];
  }

  const loadAverage = Array.isArray(snapshot.process?.loadAverage)
    ? snapshot.process.loadAverage
        .map((value) => (Number.isFinite(value) ? value.toFixed(2) : "0.00"))
        .join(" / ")
    : "—";

  return [
    {
      label: t("admin.metrics.processUptime.label"),
      value: formatDuration(snapshot.process?.uptimeSeconds, t),
    },
    {
      label: t("admin.metrics.rssMemory.label"),
      value: formatBytes(snapshot.process?.memory?.rss, t),
    },
    {
      label: t("admin.metrics.heapUsed.label"),
      value: formatBytes(snapshot.process?.memory?.heapUsed, t),
    },
    {
      label: t("admin.metrics.loadAverage.label"),
      value: loadAverage,
    },
    {
      label: t("admin.metrics.cacheHitRate.label"),
      value: snapshot.cache ? `${snapshot.cache.hitRate ?? 0}%` : "—",
      detail: snapshot.cache
        ? t("admin.metrics.cacheHitRate.detail", {
            hits: snapshot.cache.hits ?? 0,
            misses: snapshot.cache.misses ?? 0,
          })
        : null,
    },
    {
      label: t("admin.metrics.activeLocks.label"),
      value: snapshot.locks?.totalActive ?? 0,
      detail: t("admin.metrics.activeLocks.detail", {
        keys: snapshot.locks?.keys ?? 0,
        depth: snapshot.locks?.maxDepth ?? 0,
      }),
    },
  ];
}

function buildSecurityHighlights(stats, t) {
  if (!stats) {
    return [];
  }
  return [
    {
      label: t("admin.security.lockouts.label"),
      value: stats.bruteForce?.activeLockouts ?? 0,
      detail: t("admin.security.lockouts.detail", {
        count: stats.bruteForce?.lockouts?.length ?? 0,
      }),
    },
    {
      label: t("admin.security.failureKeys.label"),
      value: stats.bruteForce?.activeFailureKeys ?? 0,
    },
    {
      label: t("admin.security.rateLimit.label"),
      value: stats.rateLimit?.totalHits ?? 0,
      detail: t("admin.security.rateLimit.detail", {
        count: Object.keys(stats.rateLimit?.scopes ?? {}).length,
      }),
    },
  ];
}

function RateLimitList({ scopes, t, formatDate }) {
  if (!Array.isArray(scopes) || scopes.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        {t("admin.rateLimits.empty")}
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {scopes.map((scope) => (
        <li
          key={scope.name}
          className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {scope.name}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t("admin.rateLimits.window", {
                  window: scope.windowMs ?? "—",
                  limit: scope.limit ?? "—",
                })}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                {t("admin.rateLimits.totalHits", { count: scope.totalHits })}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t("admin.rateLimits.recentHits", {
                  minute: scope.hitsLastMinute,
                  window: scope.hitsLastWindow,
                })}
              </p>
            </div>
          </div>
          {scope.topOffenders.length > 0 && (
            <div className="mt-3 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {t("admin.rateLimits.topOffenders")}
              </p>
              <ul className="space-y-1">
                {scope.topOffenders.map((offender) => (
                  <li key={`${scope.name}-${offender.ip}`} className="text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-medium text-slate-700 dark:text-slate-200">{offender.ip}</span>
                    {" · "}
                    {t("admin.rateLimits.offenderHits", { count: offender.hits })}
                    {offender.lastHitAt && (
                      <span className="ml-1">
                        {t("admin.rateLimits.offenderLast", {
                          time: formatDate(offender.lastHitAt, {
                            timeStyle: "medium",
                          }),
                        })}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function LockoutTable({ lockouts, t, formatDate }) {
  if (!Array.isArray(lockouts) || lockouts.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        {t("admin.lockouts.empty")}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
        <thead className="bg-slate-50 dark:bg-slate-900/50">
          <tr>
            <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">
              {t("admin.lockouts.headers.portfolio")}
            </th>
            <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">
              {t("admin.lockouts.headers.ip")}
            </th>
            <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">
              {t("admin.lockouts.headers.attempts")}
            </th>
            <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">
              {t("admin.lockouts.headers.lockouts")}
            </th>
            <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">
              {t("admin.lockouts.headers.retryAfter")}
            </th>
            <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">
              {t("admin.lockouts.headers.unlocksAt")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {lockouts.map((lockout) => (
            <tr key={`${lockout.portfolioId ?? "unknown"}-${lockout.ip ?? "unknown"}`}>
              <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                {lockout.portfolioId ?? t("admin.common.unknown")}
              </td>
              <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                {lockout.ip ?? t("admin.common.unknown")}
              </td>
              <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{lockout.attempts}</td>
              <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{lockout.lockoutCount}</td>
              <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                {formatDuration(lockout.retryAfterSeconds, t)}
              </td>
              <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                {formatDate(lockout.lockedUntil, { timeStyle: "medium" })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EventsTable({ events, t, formatDate }) {
  if (!Array.isArray(events) || events.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        {t("admin.events.empty")}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
        <thead className="bg-slate-50 dark:bg-slate-900/50">
          <tr>
            <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">
              {t("admin.events.headers.time")}
            </th>
            <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">
              {t("admin.events.headers.event")}
            </th>
            <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">
              {t("admin.events.headers.portfolio")}
            </th>
            <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">
              {t("admin.events.headers.ip")}
            </th>
            <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">
              {t("admin.events.headers.details")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {events.map((event) => (
            <tr key={event.sequence}>
              <td className="whitespace-nowrap px-3 py-2 text-slate-700 dark:text-slate-200">
                {formatDate(event.timestamp ?? event.recordedAt, {
                  dateStyle: "short",
                  timeStyle: "medium",
                })}
              </td>
              <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                <span className="rounded bg-indigo-100 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200">
                  {event.event}
                </span>
              </td>
              <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                {event.portfolio_id ?? "—"}
              </td>
              <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                {event.ip ?? "—"}
              </td>
              <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                <div className="flex flex-col gap-1">
                  {event.mode && (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {t("admin.events.detail.mode", { value: event.mode })}
                    </span>
                  )}
                  {event.reason && (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {t("admin.events.detail.reason", { value: event.reason })}
                    </span>
                  )}
                  {event.scope && (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {t("admin.events.detail.scope", { value: event.scope })}
                    </span>
                  )}
                  {event.request_id && (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {t("admin.events.detail.request", { value: event.request_id })}
                    </span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminTab({ eventLimit = DEFAULT_EVENT_LIMIT }) {
  const { t, formatDate } = useI18n();
  const [monitoringSnapshot, setMonitoringSnapshot] = useState(null);
  const [securityStats, setSecurityStats] = useState(null);
  const [events, setEvents] = useState([]);
  const [navSnapshot, setNavSnapshot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [requestMetadata, setRequestMetadata] = useState({
    monitoring: null,
    security: null,
    events: null,
    nav: null,
  });
  const pollIntervalMs = useMemo(() => {
    const raw = import.meta.env?.VITE_ADMIN_POLL_INTERVAL_MS;
    const parsed = Number.parseInt(raw ?? "", 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
    return DEFAULT_POLL_INTERVAL_MS;
  }, []);

  const systemMetrics = useMemo(
    () => buildSystemMetrics(monitoringSnapshot, t),
    [monitoringSnapshot, t],
  );
  const securityHighlights = useMemo(
    () => buildSecurityHighlights(securityStats, t),
    [securityStats, t],
  );
  const lockouts = securityStats?.bruteForce?.lockouts ?? [];
  const rateLimitScopes = useMemo(() => {
    const scopes = securityStats?.rateLimit?.scopes ?? {};
    return Object.entries(scopes)
      .map(([name, scope]) => ({
        name,
        limit: scope.limit,
        windowMs: scope.windowMs,
        totalHits: scope.totalHits ?? 0,
        hitsLastMinute: scope.hitsLastMinute ?? 0,
        hitsLastWindow: scope.hitsLastWindow ?? 0,
        topOffenders: scope.topOffenders ?? [],
      }))
      .sort((a, b) => b.totalHits - a.totalHits);
  }, [securityStats]);

  const lastUpdated = monitoringSnapshot?.timestamp
    ? formatDate(monitoringSnapshot.timestamp, { dateStyle: "short", timeStyle: "medium" })
    : null;

  const handleRefresh = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  const handleExportSecurityEvents = useCallback(() => {
    const csv = buildSecurityEventsCsv(events);
    if (csv) {
      triggerCsvDownload("security-events.csv", csv);
    }
  }, [events]);

  useEffect(() => {
    if (!Number.isFinite(pollIntervalMs) || pollIntervalMs <= 0) {
      return undefined;
    }
    const intervalId = window.setInterval(() => {
      setRefreshKey((prev) => prev + 1);
    }, pollIntervalMs);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [pollIntervalMs]);

  useEffect(() => {
    const controller = new AbortController();
    let isSubscribed = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [monitoring, security, audit, nav] = await Promise.all([
          fetchMonitoringSnapshot({ signal: controller.signal }),
          fetchSecurityStats({ signal: controller.signal }),
          fetchSecurityEvents({ limit: eventLimit, signal: controller.signal }),
          fetchNavSnapshots({ perPage: 1, page: 1, signal: controller.signal }),
        ]);
        if (!isSubscribed) {
          return;
        }
        const monitoringData = monitoring?.data ?? monitoring;
        const securityData = security?.data ?? security;
        const auditData = audit?.data ?? audit;
        const navPayload = nav?.data ?? nav;
        const navRows = Array.isArray(navPayload?.data)
          ? navPayload.data
          : Array.isArray(navPayload)
            ? navPayload
            : [];
        let latestNav = navRows.at(-1) ?? null;
        let navRequestId = nav?.requestId ?? null;
        const navMeta = navPayload?.meta;
        if (navMeta?.totalPages && navMeta.totalPages > 1) {
          try {
            const navLast = await fetchNavSnapshots({
              perPage: 1,
              page: navMeta.totalPages,
              signal: controller.signal,
            });
            const navLastPayload = navLast?.data ?? navLast;
            const navLastRows = Array.isArray(navLastPayload?.data)
              ? navLastPayload.data
              : Array.isArray(navLastPayload)
                ? navLastPayload
                : [];
            if (navLastRows.length > 0) {
              latestNav = navLastRows[0];
              navRequestId = navLast.requestId ?? navRequestId;
            }
          } catch (navError) {
            if (navError.name !== "AbortError" && isSubscribed) {
              console.error("Failed to fetch latest NAV snapshot", navError);
            }
          }
        }
        setMonitoringSnapshot(monitoringData);
        setSecurityStats(securityData);
        setEvents(Array.isArray(auditData?.events) ? auditData.events : []);
        setNavSnapshot(latestNav ?? null);
        setRequestMetadata({
          monitoring: monitoring?.requestId ?? null,
          security: security?.requestId ?? null,
          events: audit?.requestId ?? null,
          nav: navRequestId,
        });
      } catch (fetchError) {
        if (fetchError.name === "AbortError") {
          return;
        }
        if (isSubscribed) {
          setNavSnapshot(null);
          setError(fetchError);
        }
      } finally {
        if (isSubscribed) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      isSubscribed = false;
      controller.abort();
    };
  }, [eventLimit, refreshKey]);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              {t("admin.header.title")}
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {t("admin.header.subtitle")}
            </p>
            {lastUpdated && (
              <p className="mt-2 text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
                {t("admin.header.lastUpdated", { timestamp: lastUpdated })}
              </p>
            )}
            {navSnapshot && (
              <div
                className={`mt-3 rounded border px-3 py-2 text-xs font-semibold sm:text-sm ${
                  navSnapshot.stale_price
                    ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
                    : "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200"
                }`}
              >
                {navSnapshot.stale_price
                  ? t("admin.nav.stale", { date: navSnapshot.date })
                  : t("admin.nav.current", { date: navSnapshot.date })}
              </div>
            )}
            {Object.values(requestMetadata).some((value) => typeof value === "string" && value.length > 0) && (
              <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
                <p className="font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t("admin.requests.title")}
                </p>
                <dl className="mt-2 space-y-1 font-mono">
                  <div className="flex items-center gap-2">
                    <dt className="text-slate-500 dark:text-slate-400">{t("admin.requests.labels.monitoring")}</dt>
                    <dd>{requestMetadata.monitoring ?? "—"}</dd>
                  </div>
                  <div className="flex items-center gap-2">
                    <dt className="text-slate-500 dark:text-slate-400">{t("admin.requests.labels.security")}</dt>
                    <dd>{requestMetadata.security ?? "—"}</dd>
                  </div>
                  <div className="flex items-center gap-2">
                    <dt className="text-slate-500 dark:text-slate-400">{t("admin.requests.labels.events")}</dt>
                    <dd>{requestMetadata.events ?? "—"}</dd>
                  </div>
                  <div className="flex items-center gap-2">
                    <dt className="text-slate-500 dark:text-slate-400">{t("admin.requests.labels.nav")}</dt>
                    <dd>{requestMetadata.nav ?? "—"}</dd>
                  </div>
                </dl>
              </div>
            )}
            {error && (
              <p className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
                {t("admin.errors.loadFailed", { message: error.message })}
                {error.requestId && (
                  <span className="mt-1 block font-mono text-xs">
                    {t("admin.errors.requestId", { value: error.requestId })}
                  </span>
                )}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading}
            className="inline-flex items-center justify-center rounded-lg border border-indigo-500 px-4 py-2 text-sm font-semibold text-indigo-600 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400 dark:border-indigo-400 dark:text-indigo-200 dark:hover:bg-indigo-900/30"
          >
            {loading ? t("admin.actions.refreshing") : t("admin.actions.refresh")}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow dark:border-slate-800 dark:bg-slate-900">
        <header className="mb-4">
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
            {t("admin.system.title")}
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t("admin.system.subtitle")}
          </p>
        </header>
        {loading && !monitoringSnapshot ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{t("admin.system.loading")}</p>
        ) : (
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {systemMetrics.map((metric) => (
              <div
                key={metric.label}
                className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {metric.label}
                </dt>
                <dd className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {metric.value}
                </dd>
                {metric.detail && (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{metric.detail}</p>
                )}
              </div>
            ))}
          </dl>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow dark:border-slate-800 dark:bg-slate-900">
        <header className="mb-4">
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
            {t("admin.security.title")}
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t("admin.security.subtitle")}
          </p>
        </header>
        <div className="grid gap-4 lg:grid-cols-3">
          <dl className="space-y-3">
            {securityHighlights.map((item) => (
              <div
                key={item.label}
                className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {item.label}
                </dt>
                <dd className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
                  {item.value}
                </dd>
                {item.detail && (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.detail}</p>
                )}
              </div>
            ))}
          </dl>
          <div className="lg:col-span-2">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t("admin.lockouts.title")}
            </h4>
            <div className="mt-2">
              <LockoutTable lockouts={lockouts} t={t} formatDate={formatDate} />
            </div>
            <h4 className="mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t("admin.rateLimits.title")}
            </h4>
            <div className="mt-2">
              <RateLimitList scopes={rateLimitScopes} t={t} formatDate={formatDate} />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow dark:border-slate-800 dark:bg-slate-900">
        <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
              {t("admin.events.title")}
            </h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {t("admin.events.subtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={handleExportSecurityEvents}
            disabled={!events || events.length === 0}
            className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-400 disabled:text-slate-200 dark:disabled:bg-slate-700"
          >
            {t("admin.events.export")}
          </button>
        </header>
        <EventsTable events={events} t={t} formatDate={formatDate} />
      </section>
    </div>
  );
}

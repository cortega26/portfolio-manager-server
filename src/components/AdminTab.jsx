import { useCallback, useEffect, useMemo, useState } from "react";

import {
  fetchMonitoringSnapshot,
  fetchSecurityEvents,
  fetchSecurityStats,
} from "../utils/api.js";

const DEFAULT_EVENT_LIMIT = 50;

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "—";
  }
  const megabytes = bytes / 1024 / 1024;
  if (!Number.isFinite(megabytes)) {
    return "—";
  }
  return `${megabytes.toFixed(1)} MB`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "—";
  }

  const totalSeconds = Math.floor(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const parts = [];

  if (days > 0) {
    parts.push(`${days}d`);
  }
  if (hours % 24 > 0) {
    parts.push(`${hours % 24}h`);
  }
  if (minutes % 60 > 0 && parts.length < 2) {
    parts.push(`${minutes % 60}m`);
  }
  if (parts.length === 0) {
    parts.push(`${totalSeconds}s`);
  }

  return parts.join(" ");
}

function buildSystemMetrics(snapshot) {
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
      label: "Process Uptime",
      value: formatDuration(snapshot.process?.uptimeSeconds),
    },
    {
      label: "RSS Memory",
      value: formatBytes(snapshot.process?.memory?.rss),
    },
    {
      label: "Heap Used",
      value: formatBytes(snapshot.process?.memory?.heapUsed),
    },
    {
      label: "Load Average (1/5/15m)",
      value: loadAverage,
    },
    {
      label: "Price Cache Hit Rate",
      value: snapshot.cache ? `${snapshot.cache.hitRate ?? 0}%` : "—",
      detail: snapshot.cache
        ? `${snapshot.cache.hits ?? 0} hits / ${snapshot.cache.misses ?? 0} misses`
        : null,
    },
    {
      label: "Active Locks",
      value: snapshot.locks?.totalActive ?? 0,
      detail: `${snapshot.locks?.keys ?? 0} keys tracked (max depth ${snapshot.locks?.maxDepth ?? 0})`,
    },
  ];
}

function buildSecurityHighlights(stats) {
  if (!stats) {
    return [];
  }
  return [
    {
      label: "Active Lockouts",
      value: stats.bruteForce?.activeLockouts ?? 0,
      detail: `${stats.bruteForce?.lockouts?.length ?? 0} lockouts tracked`,
    },
    {
      label: "Tracked Failure Keys",
      value: stats.bruteForce?.activeFailureKeys ?? 0,
    },
    {
      label: "Rate Limit Hits (lifetime)",
      value: stats.rateLimit?.totalHits ?? 0,
      detail: `${Object.keys(stats.rateLimit?.scopes ?? {}).length} scopes`,
    },
  ];
}

function RateLimitList({ scopes }) {
  if (!Array.isArray(scopes) || scopes.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        No rate limit traffic has been recorded for monitored scopes.
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
                Window {scope.windowMs ?? "—"} ms · Limit {scope.limit ?? "—"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                {scope.totalHits} total hits
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {scope.hitsLastMinute} in last minute · {scope.hitsLastWindow} in window
              </p>
            </div>
          </div>
          {scope.topOffenders.length > 0 && (
            <div className="mt-3 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Top offenders
              </p>
              <ul className="space-y-1">
                {scope.topOffenders.map((offender) => (
                  <li key={`${scope.name}-${offender.ip}`} className="text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-medium text-slate-700 dark:text-slate-200">{offender.ip}</span>
                    {" · "}
                    {offender.hits} hits
                    {offender.lastHitAt && (
                      <span className="ml-1">
                        (last at {new Date(offender.lastHitAt).toLocaleTimeString()})
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

function LockoutTable({ lockouts }) {
  if (!Array.isArray(lockouts) || lockouts.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        No lockouts are currently active.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
        <thead className="bg-slate-50 dark:bg-slate-900/50">
          <tr>
            <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">
              Portfolio
            </th>
            <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">
              IP
            </th>
            <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">
              Attempts
            </th>
            <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">
              Lockouts
            </th>
            <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">
              Retry After
            </th>
            <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">
              Unlocks At
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {lockouts.map((lockout) => (
            <tr key={`${lockout.portfolioId ?? "unknown"}-${lockout.ip ?? "unknown"}`}>
              <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                {lockout.portfolioId ?? "unknown"}
              </td>
              <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                {lockout.ip ?? "unknown"}
              </td>
              <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{lockout.attempts}</td>
              <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{lockout.lockoutCount}</td>
              <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                {formatDuration(lockout.retryAfterSeconds)}
              </td>
              <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                {new Date(lockout.lockedUntil).toLocaleTimeString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EventsTable({ events }) {
  if (!Array.isArray(events) || events.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        No security audit events captured yet. Recent authentication, rotation, and
        rate limit activity will appear here.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
        <thead className="bg-slate-50 dark:bg-slate-900/50">
          <tr>
            <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">
              Time
            </th>
            <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">
              Event
            </th>
            <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">
              Portfolio
            </th>
            <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">
              IP
            </th>
            <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">
              Details
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {events.map((event) => (
            <tr key={event.sequence}>
              <td className="whitespace-nowrap px-3 py-2 text-slate-700 dark:text-slate-200">
                {new Date(event.timestamp ?? event.recordedAt).toLocaleString()}
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
                      mode: {event.mode}
                    </span>
                  )}
                  {event.reason && (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      reason: {event.reason}
                    </span>
                  )}
                  {event.scope && (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      scope: {event.scope}
                    </span>
                  )}
                  {event.request_id && (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      request: {event.request_id}
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
  const [monitoringSnapshot, setMonitoringSnapshot] = useState(null);
  const [securityStats, setSecurityStats] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [requestMetadata, setRequestMetadata] = useState({
    monitoring: null,
    security: null,
    events: null,
  });

  const systemMetrics = useMemo(
    () => buildSystemMetrics(monitoringSnapshot),
    [monitoringSnapshot],
  );
  const securityHighlights = useMemo(
    () => buildSecurityHighlights(securityStats),
    [securityStats],
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
    ? new Date(monitoringSnapshot.timestamp).toLocaleString()
    : null;

  const handleRefresh = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let isSubscribed = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [monitoring, security, audit] = await Promise.all([
          fetchMonitoringSnapshot({ signal: controller.signal }),
          fetchSecurityStats({ signal: controller.signal }),
          fetchSecurityEvents({ limit: eventLimit, signal: controller.signal }),
        ]);
        if (!isSubscribed) {
          return;
        }
        const monitoringData = monitoring?.data ?? monitoring;
        const securityData = security?.data ?? security;
        const auditData = audit?.data ?? audit;
        setMonitoringSnapshot(monitoringData);
        setSecurityStats(securityData);
        setEvents(Array.isArray(auditData?.events) ? auditData.events : []);
        setRequestMetadata({
          monitoring: monitoring?.requestId ?? null,
          security: security?.requestId ?? null,
          events: audit?.requestId ?? null,
        });
      } catch (fetchError) {
        if (fetchError.name === "AbortError") {
          return;
        }
        if (isSubscribed) {
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
              Admin Dashboard
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Monitor server health, rate limiting behaviour, and recent security audit events.
            </p>
            {lastUpdated && (
              <p className="mt-2 text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Last refreshed {lastUpdated}
              </p>
            )}
            {Object.values(requestMetadata).some((value) => typeof value === "string" && value.length > 0) && (
              <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
                <p className="font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Last request IDs
                </p>
                <dl className="mt-2 space-y-1 font-mono">
                  <div className="flex items-center gap-2">
                    <dt className="text-slate-500 dark:text-slate-400">monitoring</dt>
                    <dd>{requestMetadata.monitoring ?? "—"}</dd>
                  </div>
                  <div className="flex items-center gap-2">
                    <dt className="text-slate-500 dark:text-slate-400">security</dt>
                    <dd>{requestMetadata.security ?? "—"}</dd>
                  </div>
                  <div className="flex items-center gap-2">
                    <dt className="text-slate-500 dark:text-slate-400">events</dt>
                    <dd>{requestMetadata.events ?? "—"}</dd>
                  </div>
                </dl>
              </div>
            )}
            {error && (
              <p className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
                Failed to load admin data: {error.message}
                {error.requestId && (
                  <span className="mt-1 block font-mono text-xs">
                    Request ID: {error.requestId}
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
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow dark:border-slate-800 dark:bg-slate-900">
        <header className="mb-4">
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
            System Health
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Runtime process metrics, cache efficiency, and lock utilisation.
          </p>
        </header>
        {loading && !monitoringSnapshot ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading system metrics…</p>
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
            Security Overview
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Track brute-force lockouts, rate limit pressure, and top offending clients.
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
              Active Lockouts
            </h4>
            <div className="mt-2">
              <LockoutTable lockouts={lockouts} />
            </div>
            <h4 className="mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Rate Limit Scopes
            </h4>
            <div className="mt-2">
              <RateLimitList scopes={rateLimitScopes} />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow dark:border-slate-800 dark:bg-slate-900">
        <header className="mb-4">
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
            Recent Security Events
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Structured audit log excerpts for authentication, rotation, and rate limit incidents.
          </p>
        </header>
        <EventsTable events={events} />
      </section>
    </div>
  );
}

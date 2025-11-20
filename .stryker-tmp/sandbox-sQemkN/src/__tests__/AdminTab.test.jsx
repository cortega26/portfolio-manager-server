// @ts-nocheck
import { afterEach, beforeEach, test, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import AdminTab from "../components/AdminTab.jsx";

vi.mock("../utils/api.js", () => ({
  fetchMonitoringSnapshot: vi.fn(),
  fetchSecurityStats: vi.fn(),
  fetchSecurityEvents: vi.fn(),
  fetchNavSnapshots: vi.fn(),
}));

const {
  fetchMonitoringSnapshot,
  fetchSecurityStats,
  fetchSecurityEvents,
  fetchNavSnapshots,
} = await import("../utils/api.js");

beforeEach(() => {
  fetchMonitoringSnapshot.mockResolvedValue({
    requestId: "req-monitoring-1",
    data: {
      timestamp: "2025-10-07T12:00:00.000Z",
      process: {
        uptimeSeconds: 3600,
        memory: { rss: 150 * 1024 * 1024, heapUsed: 75 * 1024 * 1024 },
        loadAverage: [0.5, 0.4, 0.3],
      },
      cache: { hits: 120, misses: 30, hitRate: 80, keys: 15 },
      locks: { totalActive: 2, keys: 1, maxDepth: 3 },
    },
  });

  fetchSecurityStats.mockResolvedValue({
    requestId: "req-security-1",
    data: {
      bruteForce: {
        activeLockouts: 1,
        activeFailureKeys: 4,
        lockouts: [
          {
            portfolioId: "portfolio-123",
            ip: "127.0.0.1",
            attempts: 6,
            lockoutCount: 2,
            retryAfterSeconds: 90,
            lockedUntil: "2025-10-07T12:05:00.000Z",
          },
        ],
      },
      rateLimit: {
        totalHits: 12,
        scopes: {
          portfolio: {
            limit: 20,
            windowMs: 60_000,
            totalHits: 9,
            hitsLastMinute: 3,
            hitsLastWindow: 6,
            topOffenders: [
              { ip: "203.0.113.9", hits: 5, lastHitAt: "2025-10-07T11:59:00.000Z" },
            ],
          },
        },
      },
    },
  });

  fetchSecurityEvents.mockResolvedValue({
    requestId: "req-events-1",
    data: {
      events: [
        {
          sequence: 3,
          event: "auth_failed",
          timestamp: "2025-10-07T12:04:30.000Z",
          portfolio_id: "portfolio-123",
          ip: "127.0.0.1",
          reason: "invalid_key",
        },
        {
          sequence: 2,
          event: "auth_success",
          timestamp: "2025-10-07T12:00:00.000Z",
          portfolio_id: "portfolio-123",
          ip: "127.0.0.1",
          mode: "bootstrap",
        },
      ],
    },
  });

  fetchNavSnapshots.mockResolvedValue({
    requestId: "req-nav-1",
    data: {
      data: [
        {
          date: "2025-10-07",
          stale_price: false,
        },
      ],
      meta: { totalPages: 1 },
    },
  });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

test("renders system metrics, security highlights, and audit events", async () => {
  render(<AdminTab eventLimit={25} />);

  expect(screen.getByText(/Admin Dashboard/i)).toBeInTheDocument();

  await waitFor(() => {
    expect(fetchMonitoringSnapshot).toHaveBeenCalled();
    expect(fetchSecurityStats).toHaveBeenCalled();
    expect(fetchSecurityEvents).toHaveBeenCalledWith({ limit: 25, signal: expect.any(Object) });
    expect(screen.getByText(/System Health/i)).toBeInTheDocument();
  });

  expect(screen.getByText(/Process Uptime/i)).toBeInTheDocument();
  expect(screen.getByText(/Active Lockouts/i)).toBeInTheDocument();
  expect(screen.getByText(/portfolio-123/i)).toBeInTheDocument();
  expect(screen.getByText(/auth_failed/i)).toBeInTheDocument();
  expect(screen.getByText(/invalid_key/i)).toBeInTheDocument();
  expect(screen.getByText(/req-monitoring-1/)).toBeInTheDocument();
  expect(screen.getByText(/req-security-1/)).toBeInTheDocument();
  expect(screen.getByText(/req-events-1/)).toBeInTheDocument();
});

test("refresh button triggers another fetch cycle", async () => {
  render(<AdminTab eventLimit={10} />);

  await waitFor(() => expect(fetchSecurityEvents).toHaveBeenCalledTimes(1));

  fetchSecurityEvents.mockResolvedValueOnce({
    requestId: "req-events-2",
    data: { events: [] },
  });

  screen.getByRole("button", { name: /refresh/i }).click();

  await waitFor(() => expect(fetchSecurityEvents).toHaveBeenCalledTimes(2));
});

test("auto refresh honours the configured poll interval", async () => {
  vi.useFakeTimers();
  vi.stubEnv("VITE_ADMIN_POLL_INTERVAL_MS", "2000");

  render(<AdminTab eventLimit={25} />);

  await waitFor(() => {
    expect(fetchMonitoringSnapshot).toHaveBeenCalledTimes(1);
    expect(fetchSecurityStats).toHaveBeenCalledTimes(1);
    expect(fetchSecurityEvents).toHaveBeenCalledTimes(1);
    expect(fetchNavSnapshots).toHaveBeenCalledTimes(1);
  });

  fetchMonitoringSnapshot.mockResolvedValueOnce({
    requestId: "req-monitoring-2",
    data: {
      timestamp: "2025-10-07T12:01:00.000Z",
      process: {
        uptimeSeconds: 7200,
        memory: { rss: 180 * 1024 * 1024, heapUsed: 80 * 1024 * 1024 },
        loadAverage: [0.6, 0.5, 0.4],
      },
      cache: { hits: 140, misses: 40, hitRate: 77, keys: 16 },
      locks: { totalActive: 3, keys: 2, maxDepth: 4 },
    },
  });
  fetchSecurityStats.mockResolvedValueOnce({
    requestId: "req-security-2",
    data: { bruteForce: { activeLockouts: 2, lockouts: [] }, rateLimit: { totalHits: 15, scopes: {} } },
  });
  fetchSecurityEvents.mockResolvedValueOnce({
    requestId: "req-events-2",
    data: { events: [] },
  });
  fetchNavSnapshots.mockResolvedValueOnce({
    requestId: "req-nav-2",
    data: { data: [{ date: "2025-10-07", stale_price: false }], meta: { totalPages: 1 } },
  });

  vi.advanceTimersByTime(2000);

  await waitFor(() => {
    expect(fetchMonitoringSnapshot).toHaveBeenCalledTimes(2);
    expect(fetchSecurityStats).toHaveBeenCalledTimes(2);
    expect(fetchSecurityEvents).toHaveBeenCalledTimes(2);
    expect(fetchNavSnapshots).toHaveBeenCalledTimes(2);
  });
});

test("surfaces stale pricing warnings from NAV snapshot", async () => {
  fetchNavSnapshots.mockResolvedValueOnce({
    requestId: "req-nav-stale",
    data: {
      data: [
        {
          date: "2025-10-06",
          stale_price: true,
        },
      ],
      meta: { totalPages: 1 },
    },
  });

  render(<AdminTab eventLimit={25} />);

  expect(
    await screen.findByText(
      /Nightly pricing flagged stale on 2025-10-06/i,
    ),
  ).toBeInTheDocument();
});

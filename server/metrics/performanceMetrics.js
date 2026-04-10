import os from 'node:os';
import process from 'node:process';

import { getCacheStats } from '../cache/priceCache.js';
import { getLockMetrics } from '../utils/locks.js';

function formatLoadAverage(values) {
  return values.map((value) => Number.isFinite(value) ? Number(value.toFixed(2)) : 0);
}

function formatMemoryUsage(memory) {
  return {
    rss: memory.rss ?? 0,
    heapTotal: memory.heapTotal ?? 0,
    heapUsed: memory.heapUsed ?? 0,
    external: memory.external ?? 0,
    arrayBuffers: memory.arrayBuffers ?? 0,
  };
}

export function getPerformanceMetrics({ now = Date.now() } = {}) {
  const timestamp = Number.isFinite(now) ? new Date(now).toISOString() : new Date().toISOString();
  const uptimeSeconds = Number(process.uptime().toFixed(3));
  const memory = formatMemoryUsage(process.memoryUsage());
  const loadAverage = formatLoadAverage(os.loadavg());

  return {
    timestamp,
    process: {
      pid: process.pid,
      uptimeSeconds,
      memory,
      loadAverage,
    },
    cache: getCacheStats(),
    locks: getLockMetrics(),
  };
}

export default {
  getPerformanceMetrics,
};

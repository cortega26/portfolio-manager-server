// @ts-nocheck
const queues = new Map();

function createEntry() {
  return {
    chain: Promise.resolve(),
    pending: 0,
    active: 0,
  };
}

/**
 * Execute an async function while holding an exclusive lock per key.
 * @template T
 * @param {string} key lock identifier
 * @param {() => Promise<T>} task async task to run
 * @returns {Promise<T>} result of the task
 */
export async function withLock(key, task) {
  const entry = queues.get(key) ?? createEntry();
  const previous = entry.chain;

  entry.pending += 1;

  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });

  entry.chain = previous
    .catch(() => {})
    .then(() => current);
  queues.set(key, entry);

  try {
    await previous;
    entry.pending = Math.max(0, entry.pending - 1);
    entry.active += 1;
    return await task();
  } finally {
    release();
    entry.active = Math.max(0, entry.active - 1);
    if (entry.pending === 0 && entry.active === 0) {
      queues.delete(key);
    } else {
      queues.set(key, entry);
    }
  }
}

export function getLockMetrics() {
  let totalPending = 0;
  let totalActive = 0;
  let maxDepth = 0;

  for (const entry of queues.values()) {
    totalPending += entry.pending;
    totalActive += entry.active;
    const depth = entry.pending + entry.active;
    if (depth > maxDepth) {
      maxDepth = depth;
    }
  }

  return {
    keys: queues.size,
    totalPending,
    totalActive,
    maxDepth,
  };
}

export function resetLockMetrics() {
  queues.clear();
}

export default withLock;

const queues = new Map();

/**
 * Execute an async function while holding an exclusive lock per key.
 * @template T
 * @param {string} key lock identifier
 * @param {() => Promise<T>} task async task to run
 * @returns {Promise<T>} result of the task
 */
export async function withLock(key, task) {
  const previous = queues.get(key) ?? Promise.resolve();

  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });

  queues.set(
    key,
    previous
      .catch(() => {})
      .then(() => current),
  );

  try {
    await previous;
    return await task();
  } finally {
    release();
    const pending = queues.get(key);
    if (pending === current) {
      queues.delete(key);
    }
  }
}

export default withLock;

const STORAGE_KEY = "portfolio-manager-active-portfolio";
const MAX_SNAPSHOT_SIZE_BYTES = 2_000_000;

const textEncoder = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;

function estimateSize(value) {
  if (!textEncoder) {
    const normalized = typeof value === "string" ? value : String(value ?? "");
    return normalized.length * 2;
  }
  return textEncoder.encode(value).length;
}

function estimateTransactionsFootprint(transactions) {
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return 0;
  }

  const sampleSize = Math.min(10, transactions.length);
  try {
    const sampleJson = JSON.stringify(transactions.slice(0, sampleSize));
    const averageBytes =
      sampleJson && sampleJson.length > 0
        ? estimateSize(sampleJson) / sampleSize
        : 0;
    if (!Number.isFinite(averageBytes) || averageBytes <= 0) {
      return 0;
    }
    return averageBytes * transactions.length;
  } catch {
    return MAX_SNAPSHOT_SIZE_BYTES;
  }
}

function summarizeSnapshot(originalSnapshot, transactionsLimit) {
  const snapshot = { ...originalSnapshot };
  const transactions = Array.isArray(snapshot.transactions)
    ? snapshot.transactions
    : [];
  if (transactionsLimit >= transactions.length) {
    const storedCount = transactions.length;
    if (storedCount > 0) {
      snapshot.transactions = cloneForStorage(transactions);
    } else {
      snapshot.transactions = [];
    }
    snapshot.__storage = {
      ...(snapshot.__storage ?? {}),
      truncated: false,
      transactionCount: transactions.length,
      storedTransactions: storedCount,
    };
    return snapshot;
  }

  const preserve = Math.max(0, Math.min(transactionsLimit, transactions.length));
  if (preserve === 0) {
    snapshot.transactions = [];
  } else {
    const head = Math.ceil(preserve / 2);
    const tail = preserve - head;
    const leading = transactions.slice(0, head);
    const trailing = tail > 0 ? transactions.slice(transactions.length - tail) : [];
    snapshot.transactions = cloneForStorage([...leading, ...trailing]);
  }
  snapshot.__storage = {
    ...(snapshot.__storage ?? {}),
    truncated: true,
    transactionCount: transactions.length,
    storedTransactions: snapshot.transactions.length,
  };
  return snapshot;
}

function prepareSnapshotState(state, snapshot) {
  const attemptSerialize = (candidateState) => {
    const serialized = JSON.stringify(candidateState);
    return { serialized, size: estimateSize(serialized) };
  };

  const transactions = Array.isArray(snapshot.transactions)
    ? snapshot.transactions
    : [];

  const estimatedTransactionsBytes = estimateTransactionsFootprint(transactions);

  let bestState = state;
  let bestSerialized = null;
  let bestSize = Number.POSITIVE_INFINITY;

  if (estimatedTransactionsBytes <= MAX_SNAPSHOT_SIZE_BYTES * 1.1) {
    const firstPass = attemptSerialize(state);
    if (firstPass.size <= MAX_SNAPSHOT_SIZE_BYTES) {
      return { state, serialized: firstPass.serialized };
    }
    bestState = state;
    bestSerialized = firstPass.serialized;
    bestSize = firstPass.size;
  }

  if (transactions.length === 0) {
    if (bestSerialized) {
      return { state: bestState, serialized: bestSerialized };
    }
    const fallback = attemptSerialize(state);
    return { state, serialized: fallback.serialized };
  }

  let limit = Math.max(50, Math.floor(transactions.length * 0.5));
  while (limit >= 0 && bestSize > MAX_SNAPSHOT_SIZE_BYTES) {
    const candidateSnapshot = summarizeSnapshot(snapshot, limit);
    const candidateState = {
      ...state,
      snapshots: {
        ...state.snapshots,
        [snapshot.id]: candidateSnapshot,
      },
    };
    const attempt = attemptSerialize(candidateState);
    bestState = candidateState;
    bestSerialized = attempt.serialized;
    bestSize = attempt.size;
    if (limit === 0) {
      break;
    }
    limit = Math.floor(limit * 0.5);
    if (limit < 0) {
      limit = 0;
    }
  }

  if (bestSize > MAX_SNAPSHOT_SIZE_BYTES) {
    const strippedSnapshot = summarizeSnapshot(snapshot, 0);
    const strippedState = {
      ...state,
      snapshots: {
        ...state.snapshots,
        [snapshot.id]: strippedSnapshot,
      },
    };
    const attempt = attemptSerialize(strippedState);
    return { state: strippedState, serialized: attempt.serialized };
  }

  if (!bestSerialized) {
    const fallback = attemptSerialize(bestState);
    return { state: bestState, serialized: fallback.serialized };
  }

  return { state: bestState, serialized: bestSerialized };
}

function getStorage(storage) {
  if (storage) {
    return storage;
  }
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }
  return window.localStorage;
}

function readStore(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      return { activeId: null, snapshots: {} };
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return { activeId: null, snapshots: {} };
    }
    const { activeId = null, snapshots = {} } = parsed;
    if (snapshots && typeof snapshots === "object") {
      return { activeId, snapshots };
    }
    return { activeId: null, snapshots: {} };
  } catch (error) {
    console.error("Failed to read portfolio snapshot store", error);
    return { activeId: null, snapshots: {} };
  }
}

function writeStore(storage, value, serializedOverride) {
  try {
    const serialized =
      typeof serializedOverride === "string"
        ? serializedOverride
        : JSON.stringify(value);
    storage.setItem(STORAGE_KEY, serialized);
    return true;
  } catch (error) {
    console.error("Failed to persist portfolio snapshot", error);
    return false;
  }
}

function cloneForStorage(value) {
  try {
    return structuredClone(value);
  } catch {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return value;
    }
  }
}

export function loadActivePortfolioSnapshot(storage) {
  const store = getStorage(storage);
  if (!store) {
    return null;
  }
  const state = readStore(store);
  if (!state.activeId) {
    return null;
  }
  const snapshot = state.snapshots?.[state.activeId];
  if (!snapshot) {
    return null;
  }
  return cloneForStorage(snapshot);
}

export function persistActivePortfolioSnapshot(snapshot, storage) {
  const { id } = snapshot ?? {};
  if (!id) {
    throw new Error("Portfolio snapshot requires an id");
  }
  const store = getStorage(storage);
  if (!store) {
    return false;
  }
  const state = readStore(store);
  const safeSnapshot = {
    id,
    name: typeof snapshot.name === "string" ? snapshot.name : id,
    transactions: Array.isArray(snapshot.transactions)
      ? snapshot.transactions
      : [],
    signals:
      snapshot && typeof snapshot.signals === "object"
        ? cloneForStorage(snapshot.signals)
        : {},
    settings:
      snapshot && typeof snapshot.settings === "object"
        ? cloneForStorage(snapshot.settings)
        : {},
    updatedAt:
      typeof snapshot.updatedAt === "string"
        ? snapshot.updatedAt
        : new Date().toISOString(),
  };
  const nextState = {
    activeId: id,
    snapshots: {
      ...state.snapshots,
      [id]: safeSnapshot,
    },
  };
  const { state: preparedState, serialized } = prepareSnapshotState(nextState, safeSnapshot);
  return writeStore(store, preparedState, serialized);
}

export function markSnapshotInactive(id, storage) {
  if (!id) {
    return setActivePortfolioId(null, storage);
  }
  const store = getStorage(storage);
  if (!store) {
    return false;
  }
  const state = readStore(store);
  if (!state.snapshots?.[id]) {
    return false;
  }
  const rest = { ...state.snapshots };
  delete rest[id];
  const nextState = {
    activeId: state.activeId === id ? null : state.activeId,
    snapshots: rest,
  };
  return writeStore(store, nextState);
}

export function setActivePortfolioId(id, storage) {
  const store = getStorage(storage);
  if (!store) {
    return false;
  }
  const state = readStore(store);
  const nextState = {
    activeId: id ?? null,
    snapshots: state.snapshots ?? {},
  };
  return writeStore(store, nextState);
}


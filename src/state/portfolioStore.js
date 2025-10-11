const STORAGE_KEY = "portfolio-manager-active-portfolio";

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

function writeStore(storage, value) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(value));
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
      ? cloneForStorage(snapshot.transactions)
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
  return writeStore(store, nextState);
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


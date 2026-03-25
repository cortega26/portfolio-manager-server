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

function readState(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      return { activeId: null };
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return { activeId: null };
    }
    const legacyActiveId =
      typeof parsed.activeId === "string" && parsed.activeId.trim().length > 0
        ? parsed.activeId.trim()
        : null;
    return { activeId: legacyActiveId };
  } catch (error) {
    console.error("Failed to read active portfolio preference", error);
    return { activeId: null };
  }
}

function writeState(storage, value) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error("Failed to persist active portfolio preference", error);
    return false;
  }
}

export function loadActivePortfolioId(storage) {
  const store = getStorage(storage);
  if (!store) {
    return null;
  }
  return readState(store).activeId;
}

export function setActivePortfolioId(id, storage) {
  const store = getStorage(storage);
  if (!store) {
    return false;
  }
  const normalizedId =
    typeof id === "string" && id.trim().length > 0 ? id.trim() : null;
  if (!normalizedId) {
    store.removeItem(STORAGE_KEY);
    return true;
  }
  return writeState(store, { activeId: normalizedId });
}


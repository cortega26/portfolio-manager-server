const STORAGE_KEY = 'portfolio-manager-portfolio-keys';

function getStorage(storage) {
  if (storage) {
    return storage;
  }
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }
  return window.localStorage;
}

function readStore(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }
    return parsed;
  } catch (error) {
    console.error('Failed to read portfolio keys', error);
    return {};
  }
}

function writeStore(storage, value) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error('Failed to persist portfolio key', error);
    return false;
  }
}

export function loadPortfolioKey(portfolioId, storage) {
  if (!portfolioId) {
    return '';
  }
  const store = getStorage(storage);
  if (!store) {
    return '';
  }
  const data = readStore(store);
  const value = data[portfolioId];
  return typeof value === 'string' ? value : '';
}

export function savePortfolioKey(portfolioId, key, storage) {
  if (!portfolioId) {
    return false;
  }
  const store = getStorage(storage);
  if (!store) {
    return false;
  }
  const data = readStore(store);
  if (!key) {
    delete data[portfolioId];
  } else {
    data[portfolioId] = key;
  }
  return writeStore(store, data);
}

export function removePortfolioKey(portfolioId, storage) {
  return savePortfolioKey(portfolioId, '', storage);
}


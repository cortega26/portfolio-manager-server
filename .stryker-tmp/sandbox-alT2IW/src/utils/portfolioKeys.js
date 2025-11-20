// @ts-nocheck
const keyVault = new Map();
const MAX_ENTRIES = 32;

function normalizeId(portfolioId) {
  if (typeof portfolioId !== "string") {
    return "";
  }
  const normalized = portfolioId.trim();
  return normalized.length > 0 ? normalized : "";
}

function trimVaultIfNeeded() {
  if (keyVault.size <= MAX_ENTRIES) {
    return;
  }
  const excess = keyVault.size - MAX_ENTRIES;
  const iterator = keyVault.keys();
  for (let index = 0; index < excess; index += 1) {
    const { value, done } = iterator.next();
    if (done) {
      break;
    }
    keyVault.delete(value);
  }
}

export function loadPortfolioKey(portfolioId, _storage) {
  const normalized = normalizeId(portfolioId);
  if (!normalized) {
    return "";
  }
  const value = keyVault.get(normalized);
  return typeof value === "string" ? value : "";
}

export function savePortfolioKey(portfolioId, key, _storage) {
  const normalized = normalizeId(portfolioId);
  if (!normalized) {
    return false;
  }
  if (!key) {
    keyVault.delete(normalized);
    return true;
  }
  keyVault.set(normalized, key);
  trimVaultIfNeeded();
  return true;
}

export function removePortfolioKey(portfolioId, storage) {
  return savePortfolioKey(portfolioId, "", storage);
}

export function __dangerous__resetPortfolioKeyVault() {
  keyVault.clear();
}

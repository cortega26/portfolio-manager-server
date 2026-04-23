/**
 * src/hooks/usePortfolioActions.js
 *
 * SR-080 — Portfolio mutation action handlers extracted from PortfolioManagerApp.jsx.
 *
 * Returns handlers for: adding/removing transactions, signal changes,
 * save portfolio, and load portfolio.
 */

import { useCallback } from 'react';
import { normalizeSettings, mergeSettings, persistSettingsToStorage } from '../utils/settings.js';
import { persistPortfolio, retrievePortfolio } from '../utils/api.js';
import { setActivePortfolioId } from '../state/portfolioStore.js';

/**
 * @param {object} params
 * @param {string} params.portfolioId
 * @param {Function} params.dispatchLedger
 * @param {Array} params.transactions
 * @param {object} params.signals
 * @param {object} params.settings
 * @param {Function} params.setSignals
 * @param {Function} params.setSettings
 * @param {Function} params.recoverFromPortfolioLoadError
 */
export function usePortfolioActions({
  portfolioId,
  dispatchLedger,
  transactions,
  signals,
  settings,
  setSignals,
  setSettings,
  recoverFromPortfolioLoadError,
}) {
  const handleAddTransaction = useCallback(
    (transaction) => {
      dispatchLedger({ type: 'append', transaction });
    },
    [dispatchLedger]
  );

  const handleDeleteTransaction = useCallback(
    (indexToRemove) => {
      dispatchLedger({ type: 'remove', index: indexToRemove });
    },
    [dispatchLedger]
  );

  const handleSignalChange = useCallback(
    (ticker, pct) => {
      const pctValue = Number.parseFloat(pct);
      if (!Number.isFinite(pctValue)) {
        return;
      }
      setSignals((prev) => ({ ...prev, [ticker]: { pct: pctValue } }));
    },
    [setSignals]
  );

  const applyLoadedPortfolio = useCallback(
    (data, normalizedId) => {
      dispatchLedger({
        type: 'replace',
        transactions: Array.isArray(data?.transactions) ? data.transactions : [],
        logSummary: true,
      });
      setSignals(data?.signals ?? {});
      setSettings((previous) => {
        const mergedSettings = mergeSettings(previous, data?.settings);
        persistSettingsToStorage(mergedSettings);
        return mergedSettings;
      });
      setActivePortfolioId(normalizedId);
    },
    [dispatchLedger, setSignals, setSettings]
  );

  const handleSavePortfolio = useCallback(async () => {
    const normalizedId = portfolioId.trim();
    if (!normalizedId) {
      throw new Error('Portfolio ID required');
    }
    const normalizedSettings = normalizeSettings(settings);
    const body = {
      transactions,
      signals,
      settings: normalizedSettings,
    };
    const { requestId } = await persistPortfolio(normalizedId, body);
    setActivePortfolioId(normalizedId);
    return { requestId };
  }, [portfolioId, transactions, signals, settings]);

  const handleLoadPortfolio = useCallback(async () => {
    const normalizedId = portfolioId.trim();
    if (!normalizedId) {
      throw new Error('Portfolio ID required');
    }
    try {
      const { data, requestId } = await retrievePortfolio(normalizedId);
      applyLoadedPortfolio(data, normalizedId);
      return { requestId };
    } catch (error) {
      recoverFromPortfolioLoadError(error, normalizedId);
      throw error;
    }
  }, [applyLoadedPortfolio, portfolioId, recoverFromPortfolioLoadError]);

  return {
    applyLoadedPortfolio,
    handleAddTransaction,
    handleDeleteTransaction,
    handleSignalChange,
    handleSavePortfolio,
    handleLoadPortfolio,
  };
}

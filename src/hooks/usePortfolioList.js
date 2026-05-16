import { useState, useEffect, useCallback } from 'react';
import {
  fetchPortfolioList,
  createPortfolio,
  deletePortfolio,
  renamePortfolio,
  duplicatePortfolio,
} from '../utils/api.js';

export function usePortfolioList() {
  const [portfolios, setPortfolios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchPortfolioList();
      setPortfolios(result?.portfolios ?? []);
    } catch (err) {
      setError(err.message || 'Failed to load portfolios');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = useCallback(
    async ({ id, displayName } = {}) => {
      const result = await createPortfolio({ id, displayName });
      await refresh();
      return result;
    },
    [refresh]
  );

  const remove = useCallback(
    async (id) => {
      await deletePortfolio(id);
      await refresh();
    },
    [refresh]
  );

  const rename = useCallback(
    async (id, displayName) => {
      await renamePortfolio(id, displayName);
      await refresh();
    },
    [refresh]
  );

  const duplicate = useCallback(
    async (id, newId) => {
      const result = await duplicatePortfolio(id, newId);
      await refresh();
      return result;
    },
    [refresh]
  );

  return { portfolios, loading, error, refresh, create, remove, rename, duplicate };
}

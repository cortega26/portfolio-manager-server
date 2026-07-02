import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import {
  fetchPortfolioList,
  createPortfolio,
  deletePortfolio,
  renamePortfolio,
  duplicatePortfolio,
} from '../utils/api.js';
import { queryKeys } from '../lib/queryKeys.js';

export function usePortfolioList() {
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: queryKeys.portfolios,
    queryFn: async () => {
      const result = await fetchPortfolioList();
      return result?.portfolios ?? [];
    },
    staleTime: 30 * 60 * 1000, // 30 min — portfolio list changes infrequently
  });

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.portfolios }),
    [queryClient]
  );

  const refresh = useCallback(() => {
    return queryClient.refetchQueries({ queryKey: queryKeys.portfolios });
  }, [queryClient]);

  const createMutation = useMutation({
    mutationFn: ({ id, displayName } = {}) => createPortfolio({ id, displayName }),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deletePortfolio(id),
    onSuccess: invalidate,
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, displayName }) => renamePortfolio(id, displayName),
    onSuccess: invalidate,
  });

  const duplicateMutation = useMutation({
    mutationFn: ({ id, newId }) => duplicatePortfolio(id, newId),
    onSuccess: invalidate,
  });

  const create = useCallback(
    async (params) => createMutation.mutateAsync(params),
    [createMutation]
  );

  const remove = useCallback(async (id) => deleteMutation.mutateAsync(id), [deleteMutation]);

  const rename = useCallback(
    async (id, displayName) => renameMutation.mutateAsync({ id, displayName }),
    [renameMutation]
  );

  const duplicate = useCallback(
    async (id, newId) => duplicateMutation.mutateAsync({ id, newId }),
    [duplicateMutation]
  );

  return {
    portfolios: listQuery.data ?? [],
    loading: listQuery.isLoading,
    error: listQuery.error?.message ?? null,
    refresh,
    create,
    remove,
    rename,
    duplicate,
  };
}

import React, { ReactNode } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { I18nProvider } from '../i18n/I18nProvider.jsx';

/**
 * Creates a fresh QueryClient for use in a single test case.
 * Retries are disabled in test so failures surface immediately.
 */
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
        // staleTime: 0 so data is always considered fresh and won't
        // trigger unexpected background refetches during assertions.
        staleTime: 0,
        // gcTime: Infinity so cached data survives the test without
        // being garbage-collected mid-assertion.
        gcTime: Infinity,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

/**
 * Wraps UI in all providers needed for rendering:
 * QueryClient → I18n → Router.
 *
 * Each call creates a fresh QueryClient for test isolation.
 */
export function renderWithProviders(
  ui: ReactNode,
  { route = '/', ...options }: { route?: string } & RenderOptions = {}
) {
  window.history.pushState({}, '', route);
  const queryClient = createTestQueryClient();

  const wrapper = (child: ReactNode) => (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <MemoryRouter
          initialEntries={[route]}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          {child}
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>
  );

  const result = render(wrapper(ui), options);
  return {
    ...result,
    rerender: (nextUi: ReactNode) => result.rerender(wrapper(nextUi)),
  };
}

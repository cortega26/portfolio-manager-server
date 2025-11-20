// @ts-nocheck
import React, { ReactNode } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { I18nProvider } from '../i18n/I18nProvider.jsx';

export function renderWithProviders(
  ui: ReactNode,
  { route = '/', ...options }: { route?: string } & RenderOptions = {}
) {
  window.history.pushState({}, '', route);
  const wrapper = (child: ReactNode) => (
    <I18nProvider>
      <MemoryRouter
        initialEntries={[route]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        {child}
      </MemoryRouter>
    </I18nProvider>
  );

  const result = render(wrapper(ui), options);
  return {
    ...result,
    rerender: (nextUi: ReactNode) => result.rerender(wrapper(nextUi)),
  };
}

import React, { ReactNode } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

export function renderWithProviders(
  ui: ReactNode,
  { route = '/', ...options }: { route?: string } & RenderOptions = {}
) {
  window.history.pushState({}, '', route);
  return render(
    <MemoryRouter
      initialEntries={[route]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      {ui}
    </MemoryRouter>,
    options,
  );
}

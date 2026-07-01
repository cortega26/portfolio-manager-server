import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import React from 'react';

import ErrorBoundary from '../components/ErrorBoundary.jsx';

describe('ErrorBoundary', () => {
  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <div>ok</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('ok')).toBeDefined();
  });

  it('renders fallback when a child throws', () => {
    // React logs caught errors to console.error; silence the noise.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    function Bomb() {
      throw new Error('💥');
    }

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );

    // The fallback should be visible and the thrown content should not.
    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText('Something went wrong')).toBeDefined();
    expect(screen.queryByText('💥')).toBeNull();

    spy.mockRestore();
  });
});

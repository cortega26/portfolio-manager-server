import { Navigate, Route, Routes } from 'react-router-dom';

import ErrorBoundary from './components/ErrorBoundary.jsx';
import PortfolioManagerApp from './PortfolioManagerApp.jsx';

/**
 * App root — routing only.
 *
 * QueryClientProvider is intentionally NOT here: tests need a fresh
 * QueryClient per test case, so the provider lives in the entry points
 * (src/main.jsx for Vite, electron/main.cjs for Electron) and in
 * src/__tests__/test-utils.tsx for the Vitest suite.
 */
export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<PortfolioManagerApp />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}

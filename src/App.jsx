import { Navigate, Route, Routes } from 'react-router-dom';

import ErrorBoundary from './components/ErrorBoundary.jsx';
import PortfolioManagerApp from './PortfolioManagerApp.jsx';

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

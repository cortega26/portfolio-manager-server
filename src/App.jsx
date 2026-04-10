import { Navigate, Route, Routes } from "react-router-dom";

import PortfolioManagerApp from "./PortfolioManagerApp.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<PortfolioManagerApp />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

// @ts-nocheck
import { Suspense, lazy } from "react";
import { Link, Navigate, Route, Routes, useParams } from "react-router-dom";

import PortfolioManagerApp, { LoadingFallback } from "./PortfolioManagerApp.jsx";
import { useI18n } from "./i18n/I18nProvider.jsx";

const AdminTab = lazy(() => import("./components/AdminTab.jsx"));

function getAdminAccessTokens() {
  const rawTokens = import.meta.env.VITE_ADMIN_ACCESS_TOKENS;
  if (!rawTokens) {
    return [];
  }
  return rawTokens
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
}

function AdminNotice({ variant }) {
  const { t } = useI18n();
  const titleKey =
    variant === "missing-config" ? "admin.private.missingConfig" : "admin.private.unauthorized";
  const descriptionKey =
    variant === "missing-config"
      ? "admin.private.missingConfigDescription"
      : "admin.private.unauthorizedDescription";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-100 px-4 py-12 dark:bg-slate-950">
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{t(titleKey)}</h1>
        <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">{t(descriptionKey)}</p>
        <Link
          to="/"
          className="mt-8 inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
        >
          {t("admin.private.return")}
        </Link>
      </div>
    </div>
  );
}

function AdminPortal() {
  return (
    <div className="min-h-screen bg-slate-100 px-4 py-10 dark:bg-slate-950">
      <div className="mx-auto max-w-7xl">
        <Suspense fallback={<LoadingFallback />}>
          <AdminTab />
        </Suspense>
      </div>
    </div>
  );
}

function AdminAccessGuard() {
  const tokens = getAdminAccessTokens();
  const { token } = useParams();

  if (tokens.length === 0) {
    return <AdminNotice variant="missing-config" />;
  }

  if (!token || !tokens.includes(token)) {
    return <AdminNotice variant="unauthorized" />;
  }

  return <AdminPortal />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<PortfolioManagerApp />} />
      <Route path="/admin" element={<AdminAccessGuard />} />
      <Route path="/admin/:token" element={<AdminAccessGuard />} />
      <Route path="/admin/:token/*" element={<AdminAccessGuard />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

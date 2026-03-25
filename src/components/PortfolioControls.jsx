import { useState } from "react";

import { useI18n } from "../i18n/I18nProvider.jsx";

const ERROR_MESSAGE_KEYS = {
  INVALID_SESSION_TOKEN: "portfolioControls.error.INVALID_SESSION_TOKEN",
  NO_SESSION_TOKEN: "portfolioControls.error.NO_SESSION_TOKEN",
  SESSION_AUTH_MISCONFIGURED:
    "portfolioControls.error.SESSION_AUTH_MISCONFIGURED",
  PORTFOLIO_NOT_FOUND: "portfolioControls.error.PORTFOLIO_NOT_FOUND",
  E_OVERSELL: "portfolioControls.error.E_OVERSELL",
  E_CASH_OVERDRAW: "portfolioControls.error.E_CASH_OVERDRAW",
};

const STATUS_MESSAGE_KEYS = {
  400: "portfolioControls.error.status.400",
  401: "portfolioControls.error.status.401",
  403: "portfolioControls.error.status.403",
  404: "portfolioControls.error.status.404",
  429: "portfolioControls.error.status.429",
  500: "portfolioControls.error.status.500",
};

function formatControlError(error, t) {
  if (!error || typeof error !== "object") {
    return {
      message: t("portfolioControls.status.genericError"),
      requestId: undefined,
    };
  }

  const requestId =
    typeof error.requestId === "string" && error.requestId.trim().length > 0
      ? error.requestId
      : undefined;

  if (error.name === "ApiError") {
    const code = error.body?.error;
    const errorKey = code ? ERROR_MESSAGE_KEYS[code] : null;
    if (errorKey) {
      return { message: t(errorKey), requestId };
    }
    const statusKey = STATUS_MESSAGE_KEYS[error.status];
    if (statusKey) {
      return { message: t(statusKey), requestId };
    }
    return {
      message: t("portfolioControls.status.genericError"),
      requestId,
    };
  }

  const message =
    typeof error.message === "string" && error.message.trim().length > 0
      ? error.message
      : t("portfolioControls.status.genericError");
  return { message, requestId };
}

export default function PortfolioControls({
  portfolioId,
  onPortfolioIdChange,
  onSave,
  onLoad,
  onNotify,
}) {
  const { t } = useI18n();
  const [status, setStatus] = useState(null);

  async function handle(action) {
    if (!portfolioId?.trim()) {
      setStatus({
        type: "error",
        message: t("portfolioControls.error.validation"),
        requestId: undefined,
      });
      return;
    }

    try {
      const result = await action();
      setStatus({
        type: "success",
        message: t("portfolioControls.status.success"),
        requestId: undefined,
      });
      if (typeof onNotify === "function") {
        const detail =
          result?.requestId && typeof result.requestId === "string"
            ? t("portfolioControls.toast.requestId", {
                requestId: result.requestId,
              })
            : undefined;
        const normalizedId = portfolioId.trim();
        if (action === onSave) {
          onNotify({
            type: "success",
            title: t("portfolioControls.toast.saveSuccess.title", {
              id: normalizedId,
            }),
            message: t("portfolioControls.toast.saveSuccess.body", {
              id: normalizedId,
            }),
            detail,
          });
          if (result?.snapshotPersisted === false) {
            onNotify({
              type: "warning",
              title: t("portfolioControls.toast.saveWarning.title", {
                id: normalizedId,
              }),
              message: t("portfolioControls.toast.saveWarning.body"),
              detail,
            });
          }
        } else if (action === onLoad) {
          onNotify({
            type: "success",
            title: t("portfolioControls.toast.loadSuccess.title", {
              id: normalizedId,
            }),
            message: t("portfolioControls.toast.loadSuccess.body"),
            detail,
          });
          if (result?.snapshotPersisted === false) {
            onNotify({
              type: "warning",
              title: t("portfolioControls.toast.saveWarning.title", {
                id: normalizedId,
              }),
              message: t("portfolioControls.toast.saveWarning.body"),
              detail,
            });
          }
        }
      }
    } catch (error) {
      const { message, requestId } = formatControlError(error, t);
      setStatus({ type: "error", message, requestId });
      if (typeof onNotify === "function") {
        const detail =
          requestId && typeof requestId === "string"
            ? t("portfolioControls.toast.requestId", { requestId })
            : undefined;
        const normalizedId = portfolioId.trim();
        onNotify({
          type: "error",
          title:
            action === onSave
              ? t("portfolioControls.toast.saveError.title", {
                  id: normalizedId,
                })
              : t("portfolioControls.toast.loadError.title", {
                  id: normalizedId,
                }),
          message,
          detail,
        });
      }
    }
  }

  return (
    <div className="rounded-xl bg-white p-4 shadow dark:bg-slate-900">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col">
          <label
            htmlFor="portfolioId"
            className="text-sm font-medium text-slate-600 dark:text-slate-300"
          >
            {t("portfolioControls.id")}
          </label>
          <input
            id="portfolioId"
            type="text"
            className="mt-1 w-48 rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            value={portfolioId}
            onChange={(event) => onPortfolioIdChange(event.target.value)}
            placeholder={t("portfolioControls.id.placeholder")}
          />
        </div>
        <div className="max-w-xs rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300">
          <p className="font-semibold text-slate-700 dark:text-slate-100">
            {t("portfolioControls.session.title")}
          </p>
          <p className="mt-1">{t("portfolioControls.session.description")}</p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => handle(onSave)}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
          >
            {t("portfolioControls.save")}
          </button>
          <button
            type="button"
            onClick={() => handle(onLoad)}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
          >
            {t("portfolioControls.load")}
          </button>
        </div>
      </div>
      {status && (
        <div
          className={`mt-3 text-sm ${
            status.type === "success"
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-rose-600 dark:text-rose-400"
          }`}
          role="status"
        >
          <p>{status.message}</p>
          {status.requestId && (
            <span className="mt-1 block font-mono text-xs">
              Request ID: {status.requestId}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

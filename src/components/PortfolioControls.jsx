import { useMemo, useState } from "react";

import {
  evaluateApiKeyRequirements,
  isApiKeyStrong,
} from "../../shared/apiKey.js";

const STATUS_META = {
  empty: {
    label: "Enter a key to evaluate strength",
    className: "text-slate-600 dark:text-slate-300",
  },
  weak: {
    label: "Strength: needs attention",
    className: "text-amber-600 dark:text-amber-400",
  },
  strong: {
    label: "Strength: strong",
    className: "text-emerald-600 dark:text-emerald-400",
  },
};

const ERROR_MESSAGES = {
  INVALID_KEY: "Authentication failed. Double-check the API key and try again.",
  NO_KEY: "Provide an API key in the field above to continue.",
  PORTFOLIO_NOT_FOUND: "Portfolio not found. Save it first to provision storage.",
  WEAK_KEY:
    "The provided API key does not meet the strength requirements. Use at least 12 characters with mixed case, numbers, and symbols.",
  E_OVERSELL:
    "Sell order exceeds available shares. Enable auto-clip in Settings or adjust the share count.",
  E_CASH_OVERDRAW:
    "This withdrawal exceeds the available cash balance. Reduce the amount or add funds before retrying.",
};

const STATUS_MESSAGES = {
  400: "The request could not be processed. Review the form inputs and try again.",
  401: "Authentication required. Provide a valid API key to continue.",
  403: "Access denied for this portfolio. Verify the API key or rotate it.",
  404: "Portfolio not found. Save it first to provision storage.",
  429: "Too many attempts. Wait a few minutes before retrying.",
  500: "Server error encountered. Try again shortly.",
};

function formatControlError(error) {
  if (!error || typeof error !== "object") {
    return {
      message: "Unexpected error occurred while contacting the server. Try again.",
      requestId: undefined,
    };
  }

  const requestId =
    typeof error.requestId === "string" && error.requestId.trim().length > 0
      ? error.requestId
      : undefined;

  if (error.name === "ApiError") {
    const code = error.body?.error;
    if (code && ERROR_MESSAGES[code]) {
      return { message: ERROR_MESSAGES[code], requestId };
    }
    const statusMessage = STATUS_MESSAGES[error.status];
    if (statusMessage) {
      return { message: statusMessage, requestId };
    }
    return {
      message: "The server responded with an unexpected error. Try again or contact support if it persists.",
      requestId,
    };
  }

  const message =
    typeof error.message === "string" && error.message.trim().length > 0
      ? error.message
      : "Unexpected error occurred while contacting the server. Try again.";
  return { message, requestId };
}

function resolveStatus(checks, value) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) {
    return "empty";
  }
  return checks.every((item) => item.met) ? "strong" : "weak";
}

function RequirementChecklist({ checks, status }) {
  const meta = STATUS_META[status] ?? STATUS_META.empty;
  return (
    <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600 dark:border-slate-700/80 dark:bg-slate-800/60 dark:text-slate-300">
      <p className={`font-medium ${meta.className}`}>{meta.label}</p>
      <ul className="mt-1 space-y-1">
        {checks.map((item) => (
          <li key={item.requirement} className="flex items-center gap-2">
            <span
              className={`inline-flex h-4 w-6 items-center justify-center rounded-full text-[10px] font-semibold uppercase ${
                item.met
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                  : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400"
              }`}
              aria-hidden="true"
            >
              {item.met ? "OK" : "--"}
            </span>
            <span
              className={
                item.met
                  ? "text-emerald-700 dark:text-emerald-300"
                  : "text-slate-600 dark:text-slate-300"
              }
            >
              {item.requirement}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function PortfolioControls({
  portfolioId,
  portfolioKey,
  portfolioKeyNew,
  onPortfolioIdChange,
  onPortfolioKeyChange,
  onPortfolioKeyNewChange,
  onSave,
  onLoad,
}) {
  const [status, setStatus] = useState(null);

  const keyChecks = useMemo(
    () => evaluateApiKeyRequirements(portfolioKey),
    [portfolioKey],
  );
  const rotationChecks = useMemo(
    () => evaluateApiKeyRequirements(portfolioKeyNew),
    [portfolioKeyNew],
  );
  const keyStatus = resolveStatus(keyChecks, portfolioKey);
  const rotationStatus = resolveStatus(rotationChecks, portfolioKeyNew);
  const rotationTouched = Boolean((portfolioKeyNew ?? "").trim());

  async function handle(action) {
    if (!portfolioId) {
      setStatus({ type: "error", message: "Set a portfolio ID first.", requestId: undefined });
      return;
    }
    if (!portfolioKey) {
      setStatus({ type: "error", message: "Provide an API key to continue.", requestId: undefined });
      return;
    }
    if (
      action === onSave
      && rotationTouched
      && !isApiKeyStrong(portfolioKeyNew)
    ) {
      setStatus({
        type: "error",
        message: "New API key does not meet strength requirements.",
        requestId: undefined,
      });
      return;
    }

    try {
      await action();
      setStatus({
        type: "success",
        message: "Operation completed successfully.",
        requestId: undefined,
      });
    } catch (error) {
      const { message, requestId } = formatControlError(error);
      setStatus({ type: "error", message, requestId });
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
            Portfolio ID
          </label>
          <input
            id="portfolioId"
            type="text"
            className="mt-1 w-48 rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            value={portfolioId}
            onChange={(event) => onPortfolioIdChange(event.target.value)}
            placeholder="e.g. demo-portfolio"
          />
        </div>
        <div className="flex flex-col">
          <label
            htmlFor="portfolioKey"
            className="text-sm font-medium text-slate-600 dark:text-slate-300"
          >
            API Key
          </label>
          <input
            id="portfolioKey"
            type="password"
            className="mt-1 w-48 rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            value={portfolioKey}
            onChange={(event) => onPortfolioKeyChange?.(event.target.value)}
            placeholder="Required"
            autoComplete="off"
          />
          <RequirementChecklist checks={keyChecks} status={keyStatus} />
        </div>
        <div className="flex flex-col">
          <label
            htmlFor="portfolioKeyNew"
            className="text-sm font-medium text-slate-600 dark:text-slate-300"
          >
            Rotate Key (optional)
          </label>
          <input
            id="portfolioKeyNew"
            type="password"
            className="mt-1 w-48 rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            value={portfolioKeyNew}
            onChange={(event) => onPortfolioKeyNewChange?.(event.target.value)}
            placeholder="Leave blank to keep current"
            autoComplete="off"
          />
          {rotationTouched && (
            <RequirementChecklist
              checks={rotationChecks}
              status={rotationStatus}
            />
          )}
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => handle(onSave)}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
          >
            Save Portfolio
          </button>
          <button
            type="button"
            onClick={() => handle(onLoad)}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
          >
            Load Portfolio
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

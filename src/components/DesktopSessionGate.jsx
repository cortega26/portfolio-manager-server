import { useI18n } from "../i18n/I18nProvider.jsx";

export default function DesktopSessionGate({
  portfolios,
  selectedPortfolioId,
  onPortfolioChange,
  pin,
  onPinChange,
  pinConfirm,
  onPinConfirmChange,
  loading,
  submitting,
  requiresPinSetup,
  error,
  onSubmit,
}) {
  const { t } = useI18n();

  return (
    <div className="mx-auto grid min-h-screen max-w-5xl gap-6 px-4 py-10 lg:grid-cols-[minmax(0,1.2fr)_320px]">
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="border-b border-slate-200 pb-4 dark:border-slate-800">
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">
            {t("desktopSession.title")}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            {t("desktopSession.subtitle")}
          </p>
        </div>

        <form
          className="mt-6 space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <div className="grid gap-5 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              <span>{t("desktopSession.portfolio.label")}</span>
              <select
                value={selectedPortfolioId}
                onChange={(event) => onPortfolioChange(event.target.value)}
                disabled={loading || submitting}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:border-slate-400 dark:focus:ring-slate-800"
              >
                {portfolios.map((portfolio) => (
                  <option key={portfolio.id} value={portfolio.id}>
                    {portfolio.id}
                  </option>
                ))}
              </select>
            </label>

            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">
              <p className="font-medium text-slate-800 dark:text-slate-100">
                {requiresPinSetup
                  ? t("desktopSession.portfolio.status.setup")
                  : t("desktopSession.portfolio.status.locked")}
              </p>
              <p className="mt-1 text-slate-600 dark:text-slate-300">
                {requiresPinSetup
                  ? t("desktopSession.portfolio.status.setupDetail")
                  : t("desktopSession.portfolio.status.lockedDetail")}
              </p>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              <span>{t("desktopSession.pin.label")}</span>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                value={pin}
                onChange={(event) => onPinChange(event.target.value)}
                placeholder={t("desktopSession.pin.placeholder")}
                disabled={loading || submitting}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:border-slate-400 dark:focus:ring-slate-800"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              <span>{t("desktopSession.pinConfirm.label")}</span>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                value={pinConfirm}
                onChange={(event) => onPinConfirmChange(event.target.value)}
                placeholder={t("desktopSession.pinConfirm.placeholder")}
                disabled={loading || submitting || !requiresPinSetup}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:border-slate-400 dark:focus:ring-slate-800"
              />
            </label>
          </div>

          {error ? (
            <div
              role="alert"
              className="rounded-md border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700 dark:border-rose-900/80 dark:bg-rose-950/40 dark:text-rose-300"
            >
              {error}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
            <button
              type="submit"
              disabled={loading || submitting || portfolios.length === 0}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 disabled:cursor-not-allowed disabled:bg-slate-400 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
            >
              {submitting
                ? t("desktopSession.submit.pending")
                : requiresPinSetup
                  ? t("desktopSession.submit.setup")
                  : t("desktopSession.submit.unlock")}
            </button>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {loading ? t("desktopSession.loading") : t("desktopSession.securityHint")}
            </p>
          </div>
        </form>
      </section>

      <aside className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
          {t("desktopSession.explainer.title")}
        </h2>
        <ol className="mt-4 space-y-4 text-sm leading-6 text-slate-600 dark:text-slate-300">
          <li>{t("desktopSession.explainer.stepOne")}</li>
          <li>{t("desktopSession.explainer.stepTwo")}</li>
          <li>{t("desktopSession.explainer.stepThree")}</li>
        </ol>
      </aside>
    </div>
  );
}

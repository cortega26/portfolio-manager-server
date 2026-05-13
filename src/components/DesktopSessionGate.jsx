import { useI18n } from '../i18n/I18nProvider.jsx';

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
      <section className="card-base p-6">
        <div className="border-b border-surface-200 pb-4 dark:border-surface-800">
          <h1 className="font-heading text-2xl font-bold text-surface-900 dark:text-surface-50">
            {t('desktopSession.title')}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-surface-600 dark:text-surface-300">
            {t('desktopSession.subtitle')}
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
            <label className="flex flex-col gap-2 text-sm font-medium text-surface-700 dark:text-surface-200">
              <span>{t('desktopSession.portfolio.label')}</span>
              <select
                value={selectedPortfolioId}
                onChange={(event) => onPortfolioChange(event.target.value)}
                disabled={loading || submitting}
                className="rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-surface-900 shadow-sm transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:bg-surface-50 dark:border-surface-700 dark:bg-surface-950 dark:text-surface-50 dark:focus:border-brand-400"
              >
                {portfolios.map((portfolio) => (
                  <option key={portfolio.id} value={portfolio.id}>
                    {portfolio.id}
                  </option>
                ))}
              </select>
            </label>

            <div className="rounded-lg border border-surface-200 bg-surface-50/60 px-3 py-3 text-sm dark:border-surface-800 dark:bg-surface-900/50">
              <p className="font-medium text-surface-800 dark:text-surface-100">
                {requiresPinSetup
                  ? t('desktopSession.portfolio.status.setup')
                  : t('desktopSession.portfolio.status.locked')}
              </p>
              <p className="mt-1 text-surface-600 dark:text-surface-300">
                {requiresPinSetup
                  ? t('desktopSession.portfolio.status.setupDetail')
                  : t('desktopSession.portfolio.status.lockedDetail')}
              </p>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm font-medium text-surface-700 dark:text-surface-200">
              <span>{t('desktopSession.pin.label')}</span>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                value={pin}
                onChange={(event) => onPinChange(event.target.value)}
                placeholder={t('desktopSession.pin.placeholder')}
                disabled={loading || submitting}
                className="rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-surface-900 shadow-sm transition-colors placeholder:text-surface-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:bg-surface-50 dark:border-surface-700 dark:bg-surface-950 dark:text-surface-50 dark:placeholder:text-surface-500"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm font-medium text-surface-700 dark:text-surface-200">
              <span>{t('desktopSession.pinConfirm.label')}</span>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                value={pinConfirm}
                onChange={(event) => onPinConfirmChange(event.target.value)}
                placeholder={t('desktopSession.pinConfirm.placeholder')}
                disabled={loading || submitting || !requiresPinSetup}
                className="rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-surface-900 shadow-sm transition-colors placeholder:text-surface-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:bg-surface-50 dark:border-surface-700 dark:bg-surface-950 dark:text-surface-50 dark:placeholder:text-surface-500"
              />
            </label>
          </div>

          {error ? (
            <div
              role="alert"
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700 dark:border-rose-900/80 dark:bg-rose-950/40 dark:text-rose-300"
            >
              {error}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 border-t border-surface-200 pt-4 dark:border-surface-800">
            <button
              type="submit"
              disabled={loading || submitting || portfolios.length === 0}
              className="inline-flex items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-brand-700 hover:shadow-tab focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:bg-surface-300 disabled:text-surface-500 dark:disabled:bg-surface-700 dark:disabled:text-surface-500"
            >
              {submitting
                ? t('desktopSession.submit.pending')
                : requiresPinSetup
                  ? t('desktopSession.submit.setup')
                  : t('desktopSession.submit.unlock')}
            </button>
            <p className="text-sm text-surface-500 dark:text-surface-400">
              {loading ? t('desktopSession.loading') : t('desktopSession.securityHint')}
            </p>
          </div>
        </form>
      </section>

      <aside className="card-base p-6">
        <h2 className="font-heading text-base font-bold text-surface-900 dark:text-surface-50">
          {t('desktopSession.explainer.title')}
        </h2>
        <ol className="mt-4 space-y-4 text-sm leading-6 text-surface-600 dark:text-surface-300">
          <li>{t('desktopSession.explainer.stepOne')}</li>
          <li>{t('desktopSession.explainer.stepTwo')}</li>
          <li>{t('desktopSession.explainer.stepThree')}</li>
        </ol>
      </aside>
    </div>
  );
}

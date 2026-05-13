import clsx from 'clsx';
import { useI18n } from '../i18n/I18nProvider.jsx';

function ToggleField({ id, label, description, checked, onChange, disabled = false, helperText }) {
  return (
    <div>
      <label
        htmlFor={id}
        className={clsx(
          'card-base flex items-start justify-between gap-4 p-4',
          disabled
            ? 'cursor-not-allowed opacity-60'
            : 'hover:border-brand-300 dark:hover:border-brand-500/50'
        )}
        aria-disabled={disabled}
      >
        <div>
          <span className="text-sm font-semibold text-surface-800 dark:text-surface-100">
            {label}
          </span>
          {description && (
            <p className="mt-1 text-xs text-surface-500 dark:text-surface-400">{description}</p>
          )}
        </div>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(event) => {
            if (!disabled) {
              onChange(event.target.checked);
            }
          }}
          disabled={disabled}
          className="mt-1 h-5 w-5 rounded border-surface-300 text-brand-600 focus:ring-brand-500 dark:border-surface-700 dark:bg-surface-800"
        />
      </label>
      {helperText ? (
        <p className="mt-2 text-xs text-surface-500 dark:text-surface-400">{helperText}</p>
      ) : null}
    </div>
  );
}

function SelectField({ id, label, description, value, options, onChange }) {
  return (
    <label htmlFor={id} className="card-base flex flex-col gap-2 p-4">
      <div>
        <span className="text-sm font-semibold text-surface-800 dark:text-surface-100">
          {label}
        </span>
        {description && (
          <p className="mt-1 text-xs text-surface-500 dark:text-surface-400">{description}</p>
        )}
      </div>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border border-surface-300 bg-white px-3 py-2 text-sm text-surface-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-100"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function NumberField({ id, label, description, value, min, max, step, onChange }) {
  return (
    <label htmlFor={id} className="card-base flex flex-col gap-2 p-4">
      <div>
        <span className="text-sm font-semibold text-surface-800 dark:text-surface-100">
          {label}
        </span>
        {description && (
          <p className="mt-1 text-xs text-surface-500 dark:text-surface-400">{description}</p>
        )}
      </div>
      <input
        id={id}
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const nextValue = Number(event.target.value);
          if (Number.isFinite(nextValue)) {
            onChange(nextValue);
          }
        }}
        className="rounded-md border border-surface-300 px-3 py-2 text-sm text-surface-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-100"
      />
    </label>
  );
}

function SchedulerStatusCard({ schedulerStatus }) {
  const { t } = useI18n();
  const active = typeof schedulerStatus?.active === 'boolean' ? schedulerStatus.active : null;
  const hourUtc = Number.isInteger(schedulerStatus?.hourUtc) ? schedulerStatus.hourUtc : null;
  const toneClasses =
    active === true
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200'
      : active === false
        ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200'
        : 'border-surface-200 bg-surface-50 text-surface-600 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-300';
  const stateLabel =
    active === true
      ? t('settings.scheduler.state.active')
      : active === false
        ? t('settings.scheduler.state.inactive')
        : t('settings.scheduler.state.unknown');

  return (
    <section className="card-base p-5">
      <header>
        <h2 className="font-heading text-lg font-bold text-surface-800 dark:text-surface-100">
          {t('settings.sections.scheduler.title')}
        </h2>
        <p className="mt-1 text-sm text-surface-500 dark:text-surface-400">
          {t('settings.sections.scheduler.description')}
        </p>
      </header>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className={`rounded-lg border px-4 py-3 ${toneClasses}`}>
          <p className="text-xs font-semibold uppercase tracking-[0.12em]">
            {t('settings.scheduler.runtime.label')}
          </p>
          <p className="mt-2 text-sm font-semibold">{stateLabel}</p>
          <p className="mt-1 text-xs opacity-80">
            {active === true
              ? t('settings.scheduler.runtime.active')
              : active === false
                ? t('settings.scheduler.runtime.inactive')
                : t('settings.scheduler.runtime.unknown')}
          </p>
        </div>
        <div className="rounded-lg border border-surface-200 bg-surface-50 px-4 py-3 dark:border-surface-700 dark:bg-surface-800">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-surface-500 dark:text-surface-400">
            {t('settings.scheduler.hour.label')}
          </p>
          <p className="mt-2 text-sm font-semibold text-surface-800 dark:text-surface-100">
            {hourUtc === null
              ? t('settings.scheduler.hour.unavailable')
              : t('settings.scheduler.hour.value', { hour: hourUtc })}
          </p>
          <p className="mt-1 text-xs text-surface-500 dark:text-surface-400">
            {t('settings.scheduler.hour.description')}
          </p>
        </div>
      </div>
    </section>
  );
}

export default function SettingsTab({ settings, schedulerStatus, onSettingChange, onReset }) {
  const { t } = useI18n();
  const autoClipEnabled = Boolean(settings?.autoClip);
  return (
    <div className="space-y-6">
      <section className="card-base p-5">
        <header className="flex items-center justify-between">
          <div>
            <h2 className="font-heading text-lg font-bold text-surface-800 dark:text-surface-100">
              {t('settings.sections.notifications.title')}
            </h2>
            <p className="mt-1 text-sm text-surface-500 dark:text-surface-400">
              {t('settings.sections.notifications.description')}
            </p>
          </div>
        </header>
        <div className="mt-4 space-y-3">
          <ToggleField
            id="setting-email-alerts"
            label={t('settings.notifications.email.label')}
            description={t('settings.notifications.email.description')}
            checked={Boolean(settings.notifications.email)}
            onChange={(value) => onSettingChange('notifications.email', value)}
            disabled
            helperText={t('settings.notifications.email.helper')}
          />
          <ToggleField
            id="setting-push-alerts"
            label={t('settings.notifications.push.label')}
            description={t('settings.notifications.push.description')}
            checked={settings.notifications.push !== false}
            onChange={(value) => onSettingChange('notifications.push', value)}
          />
          <ToggleField
            id="setting-signal-transition-alerts"
            label={t('settings.notifications.signalTransitions.label')}
            description={t('settings.notifications.signalTransitions.description')}
            checked={settings.notifications.signalTransitions !== false}
            onChange={(value) => onSettingChange('notifications.signalTransitions', value)}
          />
          <ToggleField
            id="setting-rebalance-reminder"
            label={t('settings.alerts.rebalance.label')}
            description={t('settings.alerts.rebalance.description')}
            checked={settings.alerts.rebalance}
            onChange={(value) => onSettingChange('alerts.rebalance', value)}
          />
          <ToggleField
            id="setting-market-status-alerts"
            label={t('settings.alerts.marketStatus.label')}
            description={t('settings.alerts.marketStatus.description')}
            checked={settings.alerts.marketStatus !== false}
            onChange={(value) => onSettingChange('alerts.marketStatus', value)}
          />
          <ToggleField
            id="setting-roi-fallback-alerts"
            label={t('settings.alerts.roiFallback.label')}
            description={t('settings.alerts.roiFallback.description')}
            checked={settings.alerts.roiFallback !== false}
            onChange={(value) => onSettingChange('alerts.roiFallback', value)}
          />
        </div>
      </section>

      <SchedulerStatusCard schedulerStatus={schedulerStatus} />

      <section className="grid gap-4 lg:grid-cols-3">
        <NumberField
          id="setting-drawdown"
          label={t('settings.alerts.drawdown.label')}
          description={t('settings.alerts.drawdown.description')}
          value={settings.alerts.drawdownThreshold}
          min={1}
          max={50}
          step={1}
          onChange={(value) => onSettingChange('alerts.drawdownThreshold', value)}
        />
        <SelectField
          id="setting-currency"
          label={t('settings.display.currency.label')}
          description={t('settings.display.currency.description')}
          value={settings.display.currency}
          options={[
            { value: 'USD', label: 'USD' },
            { value: 'EUR', label: 'EUR' },
            { value: 'GBP', label: 'GBP' },
            { value: 'JPY', label: 'JPY' },
          ]}
          onChange={(value) => onSettingChange('display.currency', value)}
        />
        <NumberField
          id="setting-refresh"
          label={t('settings.display.refresh.label')}
          description={t('settings.display.refresh.description')}
          value={settings.display.refreshInterval}
          min={1}
          max={60}
          step={1}
          onChange={(value) => onSettingChange('display.refreshInterval', value)}
        />
      </section>

      <section className="card-base p-5">
        <header>
          <h2 className="font-heading text-lg font-bold text-surface-800 dark:text-surface-100">
            {t('settings.sections.workspace.title')}
          </h2>
          <p className="mt-1 text-sm text-surface-500 dark:text-surface-400">
            {t('settings.sections.workspace.description')}
          </p>
        </header>
        <div className="mt-4 space-y-3">
          <ToggleField
            id="setting-hide-balances"
            label={t('settings.privacy.hideBalances.label')}
            description={t('settings.privacy.hideBalances.description')}
            checked={settings.privacy.hideBalances}
            onChange={(value) => onSettingChange('privacy.hideBalances', value)}
          />
          <ToggleField
            id="setting-compact-tables"
            label={t('settings.display.compactTables.label')}
            description={t('settings.display.compactTables.description')}
            checked={settings.display.compactTables}
            onChange={(value) => onSettingChange('display.compactTables', value)}
          />
          <ToggleField
            id="setting-auto-clip"
            label={t('settings.autoClip.label')}
            description={t('settings.autoClip.description')}
            checked={autoClipEnabled}
            onChange={(value) => onSettingChange('autoClip', value)}
          />
        </div>
        <button
          type="button"
          onClick={onReset}
          className="mt-6 inline-flex items-center justify-center rounded-md border border-surface-300 px-4 py-2 text-sm font-semibold text-surface-700 transition hover:border-brand-400 hover:text-brand-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 dark:border-surface-700 dark:text-surface-200 dark:hover:border-brand-400 dark:hover:text-brand-300"
        >
          {t('settings.reset')}
        </button>
      </section>
    </div>
  );
}

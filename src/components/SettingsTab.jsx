import clsx from "clsx";
import { useI18n } from "../i18n/I18nProvider.jsx";

function ToggleField({ id, label, description, checked, onChange, disabled = false, helperText }) {
  return (
    <div>
      <label
        htmlFor={id}
        className={clsx(
          "flex items-start justify-between gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition dark:border-slate-800 dark:bg-slate-900",
          disabled
            ? "cursor-not-allowed opacity-60"
            : "hover:border-indigo-300 dark:hover:border-indigo-500/50",
        )}
        aria-disabled={disabled}
      >
        <div>
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</span>
          {description && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</p>
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
          className="mt-1 h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800"
        />
      </label>
      {helperText ? (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{helperText}</p>
      ) : null}
    </div>
  );
}

function SelectField({ id, label, description, value, options, onChange }) {
  return (
    <label htmlFor={id} className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div>
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</span>
        {description && (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</p>
        )}
      </div>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
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
    <label htmlFor={id} className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div>
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</span>
        {description && (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</p>
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
        className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
      />
    </label>
  );
}

function SchedulerStatusCard({ schedulerStatus }) {
  const { t } = useI18n();
  const active =
    typeof schedulerStatus?.active === "boolean" ? schedulerStatus.active : null;
  const hourUtc =
    Number.isInteger(schedulerStatus?.hourUtc) ? schedulerStatus.hourUtc : null;
  const toneClasses =
    active === true
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200"
      : active === false
        ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
        : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300";
  const stateLabel =
    active === true
      ? t("settings.scheduler.state.active")
      : active === false
        ? t("settings.scheduler.state.inactive")
        : t("settings.scheduler.state.unknown");

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow dark:border-slate-800 dark:bg-slate-900">
      <header>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
          {t("settings.sections.scheduler.title")}
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {t("settings.sections.scheduler.description")}
        </p>
      </header>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className={`rounded-lg border px-4 py-3 ${toneClasses}`}>
          <p className="text-xs font-semibold uppercase tracking-[0.12em]">
            {t("settings.scheduler.runtime.label")}
          </p>
          <p className="mt-2 text-sm font-semibold">{stateLabel}</p>
          <p className="mt-1 text-xs opacity-80">
            {active === true
              ? t("settings.scheduler.runtime.active")
              : active === false
                ? t("settings.scheduler.runtime.inactive")
                : t("settings.scheduler.runtime.unknown")}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
            {t("settings.scheduler.hour.label")}
          </p>
          <p className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
            {hourUtc === null
              ? t("settings.scheduler.hour.unavailable")
              : t("settings.scheduler.hour.value", { hour: hourUtc })}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {t("settings.scheduler.hour.description")}
          </p>
        </div>
      </div>
    </section>
  );
}

export default function SettingsTab({
  settings,
  schedulerStatus,
  onSettingChange,
  onReset,
}) {
  const { t } = useI18n();
  const autoClipEnabled = Boolean(settings?.autoClip);
  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow dark:border-slate-800 dark:bg-slate-900">
        <header className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              {t("settings.sections.notifications.title")}
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {t("settings.sections.notifications.description")}
            </p>
          </div>
        </header>
        <div className="mt-4 space-y-3">
          <ToggleField
            id="setting-email-alerts"
            label={t("settings.notifications.email.label")}
            description={t("settings.notifications.email.description")}
            checked={Boolean(settings.notifications.email)}
            onChange={(value) => onSettingChange("notifications.email", value)}
            disabled
            helperText={t("settings.notifications.email.helper")}
          />
          <ToggleField
            id="setting-push-alerts"
            label={t("settings.notifications.push.label")}
            description={t("settings.notifications.push.description")}
            checked={settings.notifications.push !== false}
            onChange={(value) => onSettingChange("notifications.push", value)}
          />
          <ToggleField
            id="setting-signal-transition-alerts"
            label={t("settings.notifications.signalTransitions.label")}
            description={t("settings.notifications.signalTransitions.description")}
            checked={settings.notifications.signalTransitions !== false}
            onChange={(value) => onSettingChange("notifications.signalTransitions", value)}
          />
          <ToggleField
            id="setting-rebalance-reminder"
            label={t("settings.alerts.rebalance.label")}
            description={t("settings.alerts.rebalance.description")}
            checked={settings.alerts.rebalance}
            onChange={(value) => onSettingChange("alerts.rebalance", value)}
          />
          <ToggleField
            id="setting-market-status-alerts"
            label={t("settings.alerts.marketStatus.label")}
            description={t("settings.alerts.marketStatus.description")}
            checked={settings.alerts.marketStatus !== false}
            onChange={(value) => onSettingChange("alerts.marketStatus", value)}
          />
          <ToggleField
            id="setting-roi-fallback-alerts"
            label={t("settings.alerts.roiFallback.label")}
            description={t("settings.alerts.roiFallback.description")}
            checked={settings.alerts.roiFallback !== false}
            onChange={(value) => onSettingChange("alerts.roiFallback", value)}
          />
        </div>
      </section>

      <SchedulerStatusCard schedulerStatus={schedulerStatus} />

      <section className="grid gap-4 lg:grid-cols-3">
        <NumberField
          id="setting-drawdown"
          label={t("settings.alerts.drawdown.label")}
          description={t("settings.alerts.drawdown.description")}
          value={settings.alerts.drawdownThreshold}
          min={1}
          max={50}
          step={1}
          onChange={(value) => onSettingChange("alerts.drawdownThreshold", value)}
        />
        <SelectField
          id="setting-currency"
          label={t("settings.display.currency.label")}
          description={t("settings.display.currency.description")}
          value={settings.display.currency}
          options={[
            { value: "USD", label: "USD" },
            { value: "EUR", label: "EUR" },
            { value: "GBP", label: "GBP" },
            { value: "JPY", label: "JPY" },
          ]}
          onChange={(value) => onSettingChange("display.currency", value)}
        />
        <NumberField
          id="setting-refresh"
          label={t("settings.display.refresh.label")}
          description={t("settings.display.refresh.description")}
          value={settings.display.refreshInterval}
          min={1}
          max={60}
          step={1}
          onChange={(value) => onSettingChange("display.refreshInterval", value)}
        />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow dark:border-slate-800 dark:bg-slate-900">
        <header>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            {t("settings.sections.workspace.title")}
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t("settings.sections.workspace.description")}
          </p>
        </header>
        <div className="mt-4 space-y-3">
          <ToggleField
            id="setting-hide-balances"
            label={t("settings.privacy.hideBalances.label")}
            description={t("settings.privacy.hideBalances.description")}
            checked={settings.privacy.hideBalances}
            onChange={(value) => onSettingChange("privacy.hideBalances", value)}
          />
          <ToggleField
            id="setting-compact-tables"
            label={t("settings.display.compactTables.label")}
            description={t("settings.display.compactTables.description")}
            checked={settings.display.compactTables}
            onChange={(value) => onSettingChange("display.compactTables", value)}
          />
          <ToggleField
            id="setting-auto-clip"
            label={t("settings.autoClip.label")}
            description={t("settings.autoClip.description")}
            checked={autoClipEnabled}
            onChange={(value) => onSettingChange("autoClip", value)}
          />
        </div>
        <button
          type="button"
          onClick={onReset}
          className="mt-6 inline-flex items-center justify-center rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-indigo-400 hover:text-indigo-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-slate-700 dark:text-slate-200 dark:hover:border-indigo-400 dark:hover:text-indigo-300"
        >
          {t("settings.reset")}
        </button>
      </section>
    </div>
  );
}

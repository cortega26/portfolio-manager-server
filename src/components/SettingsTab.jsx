import { useI18n } from "../i18n/I18nProvider.jsx";

function ToggleField({ id, label, description, checked, onChange }) {
  return (
    <label htmlFor={id} className="flex items-start justify-between gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-indigo-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-500/50">
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
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800"
      />
    </label>
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

export default function SettingsTab({ settings, onSettingChange, onReset }) {
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
            checked={settings.notifications.email}
            onChange={(value) => onSettingChange("notifications.email", value)}
          />
          <ToggleField
            id="setting-push-alerts"
            label={t("settings.notifications.push.label")}
            description={t("settings.notifications.push.description")}
            checked={settings.notifications.push}
            onChange={(value) => onSettingChange("notifications.push", value)}
          />
          <ToggleField
            id="setting-rebalance-reminder"
            label={t("settings.alerts.rebalance.label")}
            description={t("settings.alerts.rebalance.description")}
            checked={settings.alerts.rebalance}
            onChange={(value) => onSettingChange("alerts.rebalance", value)}
          />
        </div>
      </section>

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

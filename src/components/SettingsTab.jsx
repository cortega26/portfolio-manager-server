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

export default function SettingsTab({
  settings,
  onSettingChange,
  onReset,
  portfolioSettings,
  onPortfolioSettingChange,
}) {
  const autoClipEnabled = Boolean(portfolioSettings?.autoClip);
  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow dark:border-slate-800 dark:bg-slate-900">
        <header className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Notifications</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Tailor alerts for trades, rebalancing opportunities, and market changes.
            </p>
          </div>
        </header>
        <div className="mt-4 space-y-3">
          <ToggleField
            id="setting-email-alerts"
            label="Email alerts"
            description="Receive a daily summary when new transactions are logged."
            checked={settings.notifications.email}
            onChange={(value) => onSettingChange("notifications.email", value)}
          />
          <ToggleField
            id="setting-push-alerts"
            label="Push notifications"
            description="Notify me when a signal breaches the configured threshold."
            checked={settings.notifications.push}
            onChange={(value) => onSettingChange("notifications.push", value)}
          />
          <ToggleField
            id="setting-rebalance-reminder"
            label="Monthly rebalance reminders"
            description="Get a reminder when allocations drift beyond their target bands."
            checked={settings.alerts.rebalance}
            onChange={(value) => onSettingChange("alerts.rebalance", value)}
          />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <NumberField
          id="setting-drawdown"
          label="Drawdown alert (%)"
          description="Trigger a notification if ROI falls by this percentage from the latest peak."
          value={settings.alerts.drawdownThreshold}
          min={1}
          max={50}
          step={1}
          onChange={(value) => onSettingChange("alerts.drawdownThreshold", value)}
        />
        <SelectField
          id="setting-currency"
          label="Display currency"
          description="Used for reports and holdings valuation."
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
          label="Auto-refresh (minutes)"
          description="Update pricing and ROI data on this interval while the app is open."
          value={settings.display.refreshInterval}
          min={1}
          max={60}
          step={1}
          onChange={(value) => onSettingChange("display.refreshInterval", value)}
        />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow dark:border-slate-800 dark:bg-slate-900">
        <header>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Workspace</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Control privacy and table density to match your environment.
          </p>
        </header>
        <div className="mt-4 space-y-3">
          <ToggleField
            id="setting-hide-balances"
            label="Mask balances by default"
            description="Hide currency values until hovered to protect your privacy in shared spaces."
            checked={settings.privacy.hideBalances}
            onChange={(value) => onSettingChange("privacy.hideBalances", value)}
          />
          <ToggleField
            id="setting-compact-tables"
            label="Compact table spacing"
            description="Reduce row padding for dense transaction or holdings views."
            checked={settings.display.compactTables}
            onChange={(value) => onSettingChange("display.compactTables", value)}
          />
          <ToggleField
            id="setting-auto-clip"
            label="Auto-clip oversell orders"
            description="When disabled the server rejects SELL orders that exceed available shares."
            checked={autoClipEnabled}
            onChange={(value) => onPortfolioSettingChange?.(value)}
          />
        </div>
        <button
          type="button"
          onClick={onReset}
          className="mt-6 inline-flex items-center justify-center rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-indigo-400 hover:text-indigo-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-slate-700 dark:text-slate-200 dark:hover:border-indigo-400 dark:hover:text-indigo-300"
        >
          Reset to defaults
        </button>
      </section>
    </div>
  );
}

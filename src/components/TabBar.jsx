import TabButton from "./TabButton.jsx";
import { useI18n } from "../i18n/I18nProvider.jsx";

const defaultTabs = [
  { id: "Dashboard", labelKey: "nav.dashboard" },
  { id: "Holdings", labelKey: "nav.holdings" },
  { id: "Transactions", labelKey: "nav.transactions" },
  { id: "History", labelKey: "nav.history" },
  { id: "Metrics", labelKey: "nav.metrics" },
  { id: "Reports", labelKey: "nav.reports" },
  { id: "Settings", labelKey: "nav.settings" },
];

export default function TabBar({ activeTab, onTabChange, tabs = defaultTabs }) {
  const { t } = useI18n();
  return (
    <div className="mb-6 rounded-xl bg-white/80 p-1 shadow dark:bg-slate-900/80">
      <div className="flex gap-2" role="tablist" aria-label={t("nav.aria")}>
        {tabs.map(({ id, labelKey }) => {
          const slug = id.toLowerCase();
          const tabId = `tab-${slug}`;
          const panelId = `panel-${slug}`;
          return (
            <TabButton
              key={id}
              label={t(labelKey)}
              tabId={tabId}
              panelId={panelId}
              isActive={activeTab === id}
              onClick={() => onTabChange(id)}
            />
          );
        })}
      </div>
    </div>
  );
}

export const TAB_OPTIONS = defaultTabs.map((tab) => tab.id);
export const DEFAULT_TABS = defaultTabs;

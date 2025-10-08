import TabButton from "./TabButton.jsx";

const tabs = [
  "Dashboard",
  "Holdings",
  "Transactions",
  "History",
  "Metrics",
  "Reports",
  "Settings",
  "Admin",
];

export default function TabBar({ activeTab, onTabChange }) {
  return (
    <div className="mb-6 rounded-xl bg-white/80 p-1 shadow dark:bg-slate-900/80">
      <div className="flex gap-2" role="tablist" aria-label="Dashboard navigation">
        {tabs.map((tab) => {
          const slug = tab.toLowerCase();
          const tabId = `tab-${slug}`;
          const panelId = `panel-${slug}`;
          return (
            <TabButton
              key={tab}
              label={tab}
              tabId={tabId}
              panelId={panelId}
              isActive={activeTab === tab}
              onClick={() => onTabChange(tab)}
            />
          );
        })}
      </div>
    </div>
  );
}

export { tabs as TAB_OPTIONS };

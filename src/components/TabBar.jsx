import TabButton from "./TabButton.jsx";

const tabs = [
  "Dashboard",
  "Holdings",
  "Transactions",
  "History",
  "Metrics",
  "Reports",
  "Settings",
];

export default function TabBar({ activeTab, onTabChange }) {
  return (
    <div className="mb-6 rounded-xl bg-white/80 p-1 shadow dark:bg-slate-900/80">
      <div className="flex gap-2">
        {tabs.map((tab) => (
          <TabButton
            key={tab}
            label={tab}
            isActive={activeTab === tab}
            onClick={() => onTabChange(tab)}
          />
        ))}
      </div>
    </div>
  );
}

export { tabs as TAB_OPTIONS };

import TabButton from './TabButton.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';

const TODAY_TAB = { id: 'Today', labelKey: 'nav.today' };

const defaultTabs = [
  { id: 'Dashboard', labelKey: 'nav.dashboard' },
  { id: 'Holdings', labelKey: 'nav.holdings' },
  { id: 'Prices', labelKey: 'nav.prices' },
  { id: 'Inbox', labelKey: 'nav.inbox' },
  { id: 'Transactions', labelKey: 'nav.transactions' },
  { id: 'History', labelKey: 'nav.history' },
  { id: 'Metrics', labelKey: 'nav.metrics' },
  { id: 'RealizedGains', labelKey: 'nav.realizedGains' },
  { id: 'Reports', labelKey: 'nav.reports' },
  { id: 'Settings', labelKey: 'nav.settings' },
];

export default function TabBar({
  activeTab,
  onTabChange,
  tabs = defaultTabs,
  showTodayTab = false,
}) {
  const { t } = useI18n();
  const visibleTabs = showTodayTab ? [TODAY_TAB, ...tabs] : tabs;
  return (
    <div className="overflow-x-auto">
      <div
        className="inline-flex min-w-0 gap-1 rounded-xl bg-surface-100/80 p-1 shadow-tab backdrop-blur-sm dark:bg-surface-900/80"
        role="tablist"
        aria-label={t('nav.aria')}
      >
        {visibleTabs.map(({ id, labelKey }) => {
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

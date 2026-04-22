import { useI18n } from '../../i18n/I18nProvider.jsx';

const URGENCY_CLASS = {
  HIGH: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200',
  MEDIUM: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200',
  LOW: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
};

/**
 * Zone 2 — Action inbox slot (top 3 HIGH urgency items).
 *
 * @param {{ items?: import('../../utils/api.js').InboxItem[], onSeeAll?: () => void }} props
 */
export default function DashboardZone2({ items = [], onSeeAll }) {
  const { t } = useI18n();

  if (!Array.isArray(items) || items.length === 0) {
    return (
      <div
        className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/40"
        aria-label={t('dashboard.zone2.emptyAria', { defaultValue: 'Action inbox' })}
      >
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {t('dashboard.zone2.empty', {
            defaultValue: 'No alerts or action items. Portfolio is up to date.',
          })}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.eventKey} className="flex items-start gap-3" data-testid="zone2-inbox-item">
            <span
              className={`mt-0.5 inline-block flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${URGENCY_CLASS[item.urgency] ?? URGENCY_CLASS.LOW}`}
            >
              {item.urgency}
            </span>
            <div className="min-w-0 flex-1">
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {item.ticker}
              </span>
              <span className="ml-2 text-sm text-slate-600 dark:text-slate-400">
                {item.description}
              </span>
            </div>
          </li>
        ))}
      </ul>
      {typeof onSeeAll === 'function' && (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={onSeeAll}
            className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
          >
            {t('inbox.seeAll', { defaultValue: 'See all →' })}
          </button>
        </div>
      )}
    </div>
  );
}

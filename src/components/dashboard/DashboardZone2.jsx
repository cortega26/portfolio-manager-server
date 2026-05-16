import { useI18n } from '../../i18n/I18nProvider.jsx';

const URGENCY_CLASS = {
  HIGH: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200',
  MEDIUM: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200',
  LOW: 'bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-400',
};

/**
 * Zone 2 — Action inbox slot (top 3 HIGH urgency items).
 *
 * @param {{ items?: import('../../utils/api.js').InboxItem[], onSeeAll?: () => void }} props
 */
export default function DashboardZone2({ items = [], onSeeAll }) {
  const { t } = useI18n();

  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }

  return (
    <div className="card-base overflow-hidden">
      <div className="border-l-2 border-brand-500 pl-4">
        <ul className="space-y-3">
          {items.map((item) => (
            <li
              key={item.eventKey}
              className="flex items-start gap-3"
              data-testid="zone2-inbox-item"
            >
              <span
                className={`mt-0.5 inline-block flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase ${URGENCY_CLASS[item.urgency] ?? URGENCY_CLASS.LOW}`}
              >
                {item.urgency}
              </span>
              <div className="min-w-0 flex-1">
                <span className="font-semibold text-surface-800 dark:text-surface-200">
                  {item.ticker}
                </span>
                <span className="ml-2 text-sm text-surface-500 dark:text-surface-400">
                  {item.description}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
      {typeof onSeeAll === 'function' && (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={onSeeAll}
            className="text-xs font-semibold text-brand-600 transition-colors hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
          >
            {t('inbox.seeAll', { defaultValue: 'See all →' })}
          </button>
        </div>
      )}
    </div>
  );
}

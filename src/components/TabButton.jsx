import clsx from 'clsx';

export default function TabButton({ label, isActive, onClick, tabId, panelId }) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="tab"
      id={tabId}
      aria-controls={panelId}
      aria-selected={isActive}
      className={clsx(
        'rounded-lg px-3.5 py-2 text-sm font-semibold transition-all duration-150',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
        isActive
          ? 'bg-brand-600 text-white shadow-tab hover:bg-brand-700'
          : 'text-surface-500 hover:bg-surface-200/70 hover:text-surface-700 dark:text-surface-400 dark:hover:bg-surface-800 dark:hover:text-surface-200'
      )}
    >
      {label}
    </button>
  );
}

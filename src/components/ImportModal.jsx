import { useState, useRef, useCallback } from 'react';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { importCsv } from '../utils/api.js';

function getMappingFromColumns(columns) {
  const mapping = {};
  const lower = columns.map((c) => c.trim().toLowerCase());
  const fields = ['date', 'type', 'ticker', 'shares', 'price', 'amount'];
  for (const field of fields) {
    const idx = lower.indexOf(field);
    if (idx !== -1) mapping[field] = idx;
  }
  return Object.keys(mapping).length === fields.length ? mapping : null;
}

export default function ImportModal({ portfolioId, onClose, onImportComplete, t: _appT }) {
  const { t } = useI18n();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [errors, setErrors] = useState([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const fileInputRef = useRef(null);
  const dropRef = useRef(null);

  const handleFile = useCallback(
    (selectedFile) => {
      if (!selectedFile) return;
      setFile(selectedFile);
      setErrors([]);
      setResult(null);

      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target.result;
        const lines = content.split('\n').filter((l) => l.trim());
        if (lines.length < 2) {
          setErrors([{ row: 0, message: t('import.errors.noData') }]);
          return;
        }

        // Detect mapping from header row
        const headerColumns = lines[0].split(',').map((c) => c.trim());
        const mapping = getMappingFromColumns(headerColumns);
        if (!mapping) {
          setErrors([{ row: 0, message: t('import.errors.noMapping') }]);
          return;
        }

        // Build preview rows (parse header + show first 5 data rows)
        const previewRows = [];
        const displayLines = lines.slice(1, 6);
        for (let i = 0; i < displayLines.length; i++) {
          const cols = displayLines[i].split(',').map((c) => c.trim());
          if (cols.length <= Math.max(...Object.values(mapping))) continue;
          previewRows.push({
            row: i + 2,
            date: cols[mapping.date],
            type: cols[mapping.type],
            ticker: cols[mapping.ticker],
            shares: cols[mapping.shares],
            price: cols[mapping.price],
            amount: cols[mapping.amount],
          });
        }

        setPreview({ totalLines: lines.length - 1, rows: previewRows, content, mapping });
      };
      reader.onerror = () => setErrors([{ row: 0, message: t('import.errors.readError') }]);
      reader.readAsText(selectedFile);
    },
    [t]
  );

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      const f = e.dataTransfer?.files?.[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
  }, []);

  const handleImport = useCallback(async () => {
    if (!preview) return;
    setImporting(true);
    setErrors([]);

    try {
      const result = await importCsv(portfolioId, {
        fileContents: preview.content,
        profile: 'generic',
        dryRun: false,
      });

      setResult(result);
      if (result.imported > 0) {
        onImportComplete?.(result.imported);
      }
    } catch (err) {
      setErrors([{ row: 0, message: err.message || t('import.errors.importFailed') }]);
    } finally {
      setImporting(false);
    }
  }, [preview, portfolioId, onImportComplete, t]);

  const handleDryRun = useCallback(async () => {
    if (!preview) return;
    setImporting(true);
    setErrors([]);

    try {
      const result = await importCsv(portfolioId, {
        fileContents: preview.content,
        profile: 'generic',
        dryRun: true,
      });

      setResult(result);
    } catch (err) {
      setErrors([{ row: 0, message: err.message || t('import.errors.importFailed') }]);
    } finally {
      setImporting(false);
    }
  }, [preview, portfolioId, t]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-2xl rounded-2xl bg-white p-6 shadow-elevated dark:bg-surface-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-heading text-lg font-bold text-surface-800 dark:text-surface-100">
            {t('import.title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-surface-400 hover:bg-surface-100 hover:text-surface-600 dark:hover:bg-surface-800 dark:hover:text-surface-300"
            aria-label={t('common.close')}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {!file && (
          <div
            ref={dropRef}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-surface-300 p-10 transition-colors hover:border-brand-400 dark:border-surface-600 dark:hover:border-brand-500"
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
            }}
          >
            <svg
              className="mb-3 h-10 w-10 text-surface-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <p className="text-sm font-medium text-surface-600 dark:text-surface-300">
              {t('import.dropzone.label')}
            </p>
            <p className="mt-1 text-xs text-surface-400">{t('import.dropzone.hint')}</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </div>
        )}

        {file && preview && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-surface-500 dark:text-surface-400">
              <span className="font-medium text-surface-700 dark:text-surface-200">
                {file.name}
              </span>
              <span>
                ({preview.totalLines} {t('import.rows')})
              </span>
            </div>

            <div className="overflow-x-auto rounded-lg border border-surface-200 dark:border-surface-700">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-surface-50 dark:bg-surface-800">
                  <tr>
                    <th className="px-3 py-2 font-semibold uppercase tracking-wider text-surface-500">
                      {t('import.preview.date')}
                    </th>
                    <th className="px-3 py-2 font-semibold uppercase tracking-wider text-surface-500">
                      {t('import.preview.type')}
                    </th>
                    <th className="px-3 py-2 font-semibold uppercase tracking-wider text-surface-500">
                      {t('import.preview.ticker')}
                    </th>
                    <th className="px-3 py-2 font-semibold uppercase tracking-wider text-surface-500">
                      {t('import.preview.shares')}
                    </th>
                    <th className="px-3 py-2 font-semibold uppercase tracking-wider text-surface-500">
                      {t('import.preview.price')}
                    </th>
                    <th className="px-3 py-2 font-semibold uppercase tracking-wider text-surface-500">
                      {t('import.preview.amount')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100 dark:divide-surface-800">
                  {preview.rows.map((row, i) => (
                    <tr key={i} className="hover:bg-surface-50 dark:hover:bg-surface-800/50">
                      <td className="px-3 py-2 font-mono text-surface-700 dark:text-surface-300">
                        {row.date}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded px-1.5 py-0.5 font-medium ${
                            row.type === 'BUY'
                              ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                              : row.type === 'SELL'
                                ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
                                : 'bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-400'
                          }`}
                        >
                          {row.type}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono font-medium text-surface-800 dark:text-surface-200">
                        {row.ticker}
                      </td>
                      <td className="px-3 py-2 font-mono text-surface-600 dark:text-surface-400">
                        {row.shares}
                      </td>
                      <td className="px-3 py-2 font-mono text-surface-600 dark:text-surface-400">
                        {row.price}
                      </td>
                      <td className="px-3 py-2 font-mono text-surface-600 dark:text-surface-400">
                        {row.amount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.totalLines > preview.rows.length && (
                <p className="px-3 py-2 text-xs text-surface-400">
                  {t('import.preview.more', { count: preview.totalLines - preview.rows.length })}
                </p>
              )}
            </div>

            {errors.length > 0 && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 dark:border-rose-900/50 dark:bg-rose-950/20">
                <p className="text-sm font-medium text-rose-700 dark:text-rose-300">
                  {t('import.errors.title')}
                </p>
                <ul className="mt-1 list-disc pl-4 text-xs text-rose-600 dark:text-rose-400">
                  {errors.map((err, i) => (
                    <li key={i}>
                      {err.row > 0 ? `Row ${err.row}: ` : ''}
                      {err.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result && (
              <div
                className={`rounded-lg border p-3 ${
                  result.imported > 0
                    ? 'border-brand-200 bg-brand-50 dark:border-brand-900/50 dark:bg-brand-950/20'
                    : 'border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20'
                }`}
              >
                <p className="text-sm font-medium text-surface-800 dark:text-surface-100">
                  {result.imported > 0
                    ? t('import.result.success', { count: result.imported })
                    : t('import.result.empty')}
                </p>
                {result.errors?.length > 0 && (
                  <ul className="mt-1 list-disc pl-4 text-xs text-surface-500">
                    {result.errors.map((err, i) => (
                      <li key={i}>
                        {t('import.result.rowError', { row: err.row, message: err.message })}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleDryRun}
                disabled={importing}
                className="flex-1 rounded-lg border border-surface-300 px-4 py-2 text-sm font-semibold text-surface-700 transition-colors hover:bg-surface-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-surface-600 dark:text-surface-300 dark:hover:bg-surface-800"
              >
                {importing ? t('import.validating') : t('import.validate')}
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={importing || (result && result.imported > 0)}
                className="flex-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-surface-300 disabled:text-surface-500 dark:disabled:bg-surface-700 dark:disabled:text-surface-500"
              >
                {importing
                  ? t('import.importing')
                  : result && result.imported > 0
                    ? t('import.done')
                    : t('import.import')}
              </button>
            </div>
          </div>
        )}

        {file && !preview && (
          <div className="text-center text-surface-400">
            <p>{t('import.parsing')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * src/i18n/i18nUtils.js
 *
 * Pure translation helpers extracted from I18nProvider.
 * These functions have no React dependency and can be tested in Node.
 */

/**
 * Replaces {token} placeholders in a template string with values from an object.
 * Tokens not found in values are left intact as {token}.
 *
 * @param {string} template
 * @param {Record<string, unknown>} [values]
 * @returns {string}
 */
export function interpolate(template, values = {}) {
  if (!values || typeof values !== 'object') {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (_, token) =>
    Object.prototype.hasOwnProperty.call(values, token) ? String(values[token]) : `{${token}}`
  );
}

/**
 * Resolves a translation key from a language table.
 *
 * Priority order:
 *  1. Key in the current language table
 *  2. Key in the English fallback table
 *  3. vars.defaultValue (if provided)
 *  4. The raw key itself
 *
 * `defaultValue` is extracted from vars before interpolation so it never
 * appears as a {defaultValue} substitution in the output template.
 *
 * @param {Record<string, Record<string, string>>} tables  - { en: {...}, es: {...} }
 * @param {string} language
 * @param {string} key
 * @param {{ defaultValue?: string, [token: string]: unknown }} [vars]
 * @returns {string}
 */
export function translate(tables, language, key, vars) {
  const FALLBACK = 'en';
  const { defaultValue, ...interpolationVars } = vars ?? {};

  const table = tables[language] ?? tables[FALLBACK] ?? {};
  const fallbackTable = tables[FALLBACK] ?? {};
  const template = table[key] ?? fallbackTable[key] ?? defaultValue ?? key;

  return interpolate(template, interpolationVars);
}

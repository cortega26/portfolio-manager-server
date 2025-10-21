import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  configureFormat,
  formatCurrency as baseFormatCurrency,
  formatPercent as baseFormatPercent,
  formatSignedPercent as baseFormatSignedPercent,
} from "../utils/format.js";
import { translations } from "./translations.js";

const FALLBACK_LANGUAGE = "en";
const STORAGE_KEY = "portfolio-manager-language";

const LANGUAGE_CONFIG = {
  en: { locale: "en-US", currency: "USD", measurementSystem: "imperial" },
  es: { locale: "es-ES", currency: "USD", measurementSystem: "metric" },
};

const I18nContext = createContext(null);

function interpolate(template, values = {}) {
  return template.replace(/\{(\w+)\}/g, (_, token) =>
    Object.prototype.hasOwnProperty.call(values, token) ? String(values[token]) : `{${token}}`,
  );
}

function getInitialLanguage() {
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && LANGUAGE_CONFIG[stored]) {
      return stored;
    }
    const navigatorLang = window.navigator?.language ?? window.navigator?.languages?.[0];
    if (typeof navigatorLang === "string") {
      const normalized = navigatorLang.slice(0, 2).toLowerCase();
      if (LANGUAGE_CONFIG[normalized]) {
        return normalized;
      }
    }
  }
  return FALLBACK_LANGUAGE;
}

export function I18nProvider({ children }) {
  const [language, setLanguage] = useState(getInitialLanguage);

  const config = LANGUAGE_CONFIG[language] ?? LANGUAGE_CONFIG[FALLBACK_LANGUAGE];
  const locale = config.locale;
  const [currencyOverride, setCurrencyOverride] = useState(null);
  const currency = currencyOverride ?? config.currency;

  useEffect(() => {
    configureFormat({ locale, currency });
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, language);
    }
  }, [currency, language, locale]);

  const translate = useCallback(
    (key, vars) => {
      const table = translations[language] ?? translations[FALLBACK_LANGUAGE];
      const fallbackTable = translations[FALLBACK_LANGUAGE] ?? {};
      const template = table[key] ?? fallbackTable[key] ?? key;
      return interpolate(template, vars);
    },
    [language],
  );

  const formatCurrency = useCallback(
    (value, options) => baseFormatCurrency(value, { locale, currency, ...options }),
    [currency, locale],
  );

  const formatPercent = useCallback(
    (value, fractionDigits = 2, options) =>
      baseFormatPercent(value, fractionDigits, { locale, ...options }),
    [locale],
  );

  const formatSignedPercent = useCallback(
    (value, fractionDigits = 2, options) =>
      baseFormatSignedPercent(value, fractionDigits, { locale, ...options }),
    [locale],
  );

  const formatDate = useCallback(
    (value, options = {}) => {
      if (!value) {
        return "—";
      }
      const date = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(date.getTime())) {
        return "—";
      }
      try {
        const formatter = new Intl.DateTimeFormat(locale, options);
        return formatter.format(date);
      } catch {
        return "—";
      }
    },
    [locale],
  );

  const value = useMemo(
    () => ({
      language,
      locale,
      currency,
      measurementSystem: config.measurementSystem,
      setLanguage,
      setCurrencyOverride,
      t: translate,
      formatCurrency,
      formatPercent,
      formatSignedPercent,
      formatDate,
    }),
    [
      config.measurementSystem,
      currency,
      formatCurrency,
      formatDate,
      formatPercent,
      formatSignedPercent,
      language,
      setCurrencyOverride,
      locale,
      translate,
    ],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
}

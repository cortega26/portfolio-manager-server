import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { configureFormat, formatCurrency, formatPercent, formatSignedPercent } from "../utils/format.js";
import { translations } from "./translations.js";

const FALLBACK_LANGUAGE = "en";
const STORAGE_KEY = "portfolio-manager-language";

const LANGUAGE_CONFIG = {
  en: {
    locale: "en-US",
    currency: "USD",
    measurementSystem: "imperial",
    dateOptions: { dateStyle: "medium" },
  },
  es: {
    locale: "es-ES",
    currency: "USD",
    measurementSystem: "metric",
    dateOptions: { dateStyle: "long" },
  },
};

const I18nContext = createContext(null);

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

function interpolate(template, values = {}) {
  return template.replace(/\{(\w+)\}/g, (_, token) => {
    if (Object.prototype.hasOwnProperty.call(values, token)) {
      return String(values[token]);
    }
    return `{${token}}`;
  });
}

function resolveTranslation(language, key) {
  const langTable = translations[language] ?? translations[FALLBACK_LANGUAGE];
  return langTable[key] ?? translations[FALLBACK_LANGUAGE][key] ?? key;
}

export function I18nProvider({ children }) {
  const [language, setLanguage] = useState(getInitialLanguage);

  const config = LANGUAGE_CONFIG[language] ?? LANGUAGE_CONFIG[FALLBACK_LANGUAGE];

  useEffect(() => {
    configureFormat({ locale: config.locale, currency: config.currency });
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, language);
    }
  }, [config.currency, config.locale, language]);

  const translate = useCallback(
    (key, values) => interpolate(resolveTranslation(language, key), values),
    [language],
  );

  const formatDate = useCallback(
    (value, options) => {
      if (!value) {
        return "—";
      }
      try {
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) {
          return "—";
        }
        const formatter = new Intl.DateTimeFormat(config.locale, options ?? config.dateOptions);
        return formatter.format(date);
      } catch (error) {
        return "—";
      }
    },
    [config.dateOptions, config.locale],
  );

  const formatNumber = useCallback(
    (value, options) => {
      if (value === undefined || value === null || Number.isNaN(value)) {
        return "—";
      }
      const formatter = new Intl.NumberFormat(config.locale, options);
      return formatter.format(Number(value));
    },
    [config.locale],
  );

  const contextValue = useMemo(
    () => ({
      language,
      locale: config.locale,
      currency: config.currency,
      measurementSystem: config.measurementSystem,
      setLanguage,
      t: translate,
      formatDate,
      formatNumber,
      formatCurrency: (value, options) =>
        formatCurrency(value, { locale: config.locale, currency: config.currency, ...options }),
      formatPercent: (value, digits, options) =>
        formatPercent(value, digits, { locale: config.locale, ...options }),
      formatSignedPercent: (value, digits, options) =>
        formatSignedPercent(value, digits, { locale: config.locale, ...options }),
    }),
    [
      config.currency,
      config.locale,
      config.measurementSystem,
      formatDate,
      formatNumber,
      language,
      translate,
    ],
  );

  return <I18nContext.Provider value={contextValue}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
}


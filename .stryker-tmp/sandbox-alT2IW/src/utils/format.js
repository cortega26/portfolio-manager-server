// @ts-nocheck
let activeLocale = "en-US";
let activeCurrency = "USD";

export function configureFormat({ locale, currency } = {}) {
  if (typeof locale === "string" && locale.trim()) {
    activeLocale = locale;
  }
  if (typeof currency === "string" && currency.trim()) {
    activeCurrency = currency;
  }
}

function isNilOrNaN(value) {
  return Number.isNaN(value) || value === undefined || value === null;
}

export function formatCurrency(value, { locale, currency } = {}) {
  if (isNilOrNaN(value)) {
    return "—";
  }

  const resolvedLocale = locale ?? activeLocale;
  const resolvedCurrency = currency ?? activeCurrency;
  const formatter = new Intl.NumberFormat(resolvedLocale, {
    style: "currency",
    currency: resolvedCurrency,
    maximumFractionDigits: 2,
  });
  return formatter.format(Number(value));
}

export function formatPercent(value, fractionDigits = 2, { locale } = {}) {
  if (isNilOrNaN(value)) {
    return "—";
  }

  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    return "—";
  }

  const formatter = new Intl.NumberFormat(locale ?? activeLocale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  return `${formatter.format(normalized)}%`;
}

export function formatSignedPercent(value, fractionDigits = 2, { locale } = {}) {
  if (isNilOrNaN(value)) {
    return "—";
  }

  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    return "—";
  }

  const rounded = Number(normalized.toFixed(fractionDigits));
  const localeToUse = locale ?? activeLocale;

  const percentFormatter = new Intl.NumberFormat(localeToUse, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });

  if (rounded === 0 || Object.is(rounded, -0)) {
    return `${percentFormatter.format(0)}%`;
  }

  const absolute = percentFormatter.format(Math.abs(rounded));
  const sign = rounded > 0 ? "+" : "-";
  return `${sign}${absolute}%`;
}

export function formatNumber(value, { locale, minimumFractionDigits = 0, maximumFractionDigits = 2 } = {}) {
  if (isNilOrNaN(value)) {
    return "—";
  }

  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    return "—";
  }

  const formatter = new Intl.NumberFormat(locale ?? activeLocale, {
    minimumFractionDigits,
    maximumFractionDigits,
  });
  return formatter.format(normalized);
}

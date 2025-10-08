export function formatCurrency(value) {
  if (Number.isNaN(value) || value === undefined || value === null) {
    return "—";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function isNilOrNaN(value) {
  return Number.isNaN(value) || value === undefined || value === null;
}

export function formatPercent(value, fractionDigits = 2) {
  if (isNilOrNaN(value)) {
    return "—";
  }

  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    return "—";
  }

  return `${normalized.toFixed(fractionDigits)}%`;
}

export function formatSignedPercent(value, fractionDigits = 2) {
  if (isNilOrNaN(value)) {
    return "—";
  }

  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    return "—";
  }

  const rounded = Number(normalized.toFixed(fractionDigits));
  const isNegativeZero = Object.is(rounded, -0);
  if (rounded === 0 || isNegativeZero) {
    return `${(0).toFixed(Math.max(0, fractionDigits))}%`;
  }

  const absolute = Math.abs(rounded).toFixed(fractionDigits);
  const sign = rounded > 0 ? "+" : "-";
  return `${sign}${absolute}%`;
}

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

export function formatPercent(value, fractionDigits = 2) {
  if (Number.isNaN(value) || value === undefined || value === null) {
    return "—";
  }

  return `${value.toFixed(fractionDigits)}%`;
}

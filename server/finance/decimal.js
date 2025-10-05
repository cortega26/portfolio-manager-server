import Decimal from 'decimal.js';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export const d = (value) => new Decimal(value ?? 0);

export const roundDecimal = (value, places = 8) => d(value).toDecimalPlaces(places);

export const toCents = (value) =>
  roundDecimal(d(value).times(100), 0)
    .toNumber();

export const fromCents = (cents) => d(cents).div(100);

export const toMicroShares = (value) =>
  roundDecimal(d(value).times(1_000_000), 0)
    .toNumber();

export const fromMicroShares = (microShares) => d(microShares).div(1_000_000);

export const ZERO = d(0);

// server/finance/decimal.ts
import { Decimal } from 'decimal.js';

import type { Cents, MicroShares } from '../types/domain.js';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export const d = (value: Decimal.Value | null | undefined): Decimal =>
  new Decimal(value ?? 0);

export const roundDecimal = (
  value: Decimal.Value,
  places = 8,
): Decimal => d(value).toDecimalPlaces(places);

export const toCents = (value: Decimal.Value): Cents =>
  roundDecimal(d(value).times(100), 0).toNumber();

export const fromCents = (cents: Cents): Decimal => d(cents).div(100);

export const toMicroShares = (value: Decimal.Value): MicroShares =>
  roundDecimal(d(value).times(1_000_000), 0).toNumber();

export const fromMicroShares = (microShares: MicroShares): Decimal =>
  d(microShares).div(1_000_000);

export const ZERO = d(0);

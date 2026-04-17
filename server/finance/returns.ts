// server/finance/returns.ts
import { buildCashSeries, toDateKey } from './cash.js';
import { externalFlowsByDate } from './portfolio.js';
import { d, fromCents, roundDecimal, toCents, ZERO } from './decimal.js';
import type { Decimal } from 'decimal.js';
import type { ISODate } from '../types/domain.js';

const MS_PER_DAY = 86_400_000;

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

interface ApyEntry {
  from?: string;
  to?: string | null;
  apy?: number;
  effective_date?: string;
  date?: string;
}

interface NormalizedApyEntry {
  from: string;
  to: string | null;
  apy: number;
}

interface NormalizedCashPolicy {
  currency: string;
  apyTimeline: NormalizedApyEntry[];
}

export interface ReturnRow {
  date: ISODate;
  r_port: number;
  r_ex_cash: number;
  r_bench_blended: number;
  r_spy_100: number;
  r_qqq_100: number;
  r_cash: number;
}

export interface DrawdownResult {
  maxDrawdown: number;
  peakDate: ISODate;
  troughDate: ISODate;
}

export interface SummarizedReturns {
  r_port: number;
  r_ex_cash: number;
  r_bench_blended: number;
  r_spy_100: number;
  r_qqq_100: number;
  r_cash: number;
  annualized_r_port?: number | null;
  annualized_r_ex_cash?: number | null;
  annualized_r_bench_blended?: number | null;
  annualized_r_spy_100?: number | null;
  annualized_r_qqq_100?: number | null;
  annualized_r_cash?: number | null;
}

interface DailyStateRow {
  date: ISODate;
  cash: number;
  riskValue: number;
  nav: number;
  holdings?: Map<string, number>;
}

interface NavRow {
  date: ISODate;
  portfolio_nav?: number;
}

interface TxRow {
  id?: string;
  type?: string;
  date?: string;
  amount?: number | string;
}

interface XirrFlowInput {
  date: string | Date | number;
  amount: Decimal | number | string;
}

interface PreparedXirrFlow {
  date: Date;
  amount: Decimal;
  years: Decimal;
}

interface MoneyWeightedFlowEntry {
  date: string;
  amount: Decimal;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function toCanonicalDate(value: unknown): string | null {
  if (typeof value !== 'string' && !(value instanceof Date)) {
    return null;
  }
  const key = toDateKey(value);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(key)) {
    return null;
  }
  return key;
}

function previousDate(dateKey: string): string {
  const current = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(current.getTime())) {
    return dateKey;
  }
  current.setUTCDate(current.getUTCDate() - 1);
  return current.toISOString().slice(0, 10);
}

function normalizeApyTimeline(raw: unknown): NormalizedApyEntry[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const canonical = (raw as ApyEntry[])
    .map((entry): NormalizedApyEntry | null => {
      const from = toCanonicalDate(entry?.from ?? entry?.effective_date ?? entry?.date);
      if (!from) {
        return null;
      }
      const to = toCanonicalDate(entry?.to ?? null);
      const apy = Number.isFinite(entry?.apy) ? Number(entry.apy) : 0;
      return { from, to: to ?? null, apy };
    })
    .filter((x): x is NormalizedApyEntry => x !== null)
    .sort((a, b) => {
      const fromDiff = a.from.localeCompare(b.from);
      if (fromDiff !== 0) {
        return fromDiff;
      }
      return (a.to ?? '').localeCompare(b.to ?? '');
    });

  const result: NormalizedApyEntry[] = [];
  for (const entry of canonical) {
    const normalized: NormalizedApyEntry = {
      from: entry.from,
      to: entry.to && entry.to < entry.from ? entry.from : entry.to,
      apy: entry.apy,
    };
    const last = result[result.length - 1];
    if (!last) {
      result.push(normalized);
      continue;
    }
    if (normalized.from <= last.from) {
      result[result.length - 1] = normalized;
      continue;
    }
    if (last.to && last.to < normalized.from) {
      result.push(normalized);
      continue;
    }
    const adjustedEnd = previousDate(normalized.from);
    if (adjustedEnd < last.from) {
      result[result.length - 1] = normalized;
      continue;
    }
    result[result.length - 1] = {
      ...last,
      to: adjustedEnd,
    };
    result.push(normalized);
  }
  return result;
}

function normalizeCashPolicy(input: unknown): NormalizedCashPolicy {
  if (input && typeof input === 'object' && Array.isArray((input as Record<string, unknown>).apyTimeline)) {
    const rawCurrency = (input as Record<string, unknown>).currency;
    const currency = typeof rawCurrency === 'string'
      ? rawCurrency.trim().toUpperCase()
      : 'USD';
    return {
      currency: /^[A-Z]{3}$/u.test(currency) ? currency : 'USD',
      apyTimeline: normalizeApyTimeline((input as Record<string, unknown>).apyTimeline),
    };
  }
  if (Array.isArray(input)) {
    return {
      currency: 'USD',
      apyTimeline: normalizeApyTimeline(
        [...input]
          .filter((row): row is Record<string, unknown> => typeof row?.effective_date === 'string')
          .map((row) => ({
            from: row['effective_date'] as string,
            to: null,
            apy: Number.isFinite(row['apy']) ? Number(row['apy']) : 0,
          })),
      ),
    };
  }
  return { currency: 'USD', apyTimeline: [] };
}

export function annualizeReturn(cumulative: number, days: number): number | null {
  const dDays = d(days);
  if (!dDays.isFinite() || dDays.lt(365)) {
    return null;
  }
  if (d(cumulative).isZero()) {
    return 0;
  }
  return roundDecimal(
    d(1).plus(cumulative).pow(d(365).div(dDays)).minus(1),
    8,
  ).toNumber();
}

export function computeMaxDrawdown(
  dailyReturnRows: ReturnRow[],
): DrawdownResult | null {
  if (!Array.isArray(dailyReturnRows) || dailyReturnRows.length < 2) {
    return null;
  }
  let cumulative = d(1);
  let peak = cumulative;
  let peakDate: ISODate = dailyReturnRows[0]?.date ?? '';
  let maxDrawdown: Decimal = ZERO;
  let troughDate: ISODate = dailyReturnRows[0]?.date ?? '';
  let currentPeakDate: ISODate = peakDate;

  for (let i = 0; i < dailyReturnRows.length; i += 1) {
    const row = dailyReturnRows[i];
    if (!row) continue;
    if (i > 0) {
      cumulative = cumulative.times(d(1).plus(row.r_port));
    }
    if (cumulative.gte(peak)) {
      peak = cumulative;
      currentPeakDate = row.date;
    }
    const drawdown = peak.isZero() ? ZERO : cumulative.minus(peak).dividedBy(peak);
    if (drawdown.lt(maxDrawdown)) {
      maxDrawdown = drawdown;
      peakDate = currentPeakDate;
      troughDate = row.date;
    }
  }

  return {
    maxDrawdown: roundDecimal(maxDrawdown, 6).toNumber(),
    peakDate,
    troughDate,
  };
}

export function computeReturnStep(
  prevNav: number | Decimal,
  nav: number | Decimal,
  flow: number | Decimal,
): Decimal {
  const prev = d(prevNav as Decimal.Value);
  if (prev.lte(0)) {
    return ZERO;
  }
  return d(nav as Decimal.Value)
    .minus(flow as Decimal.Value)
    .dividedBy(prev)
    .minus(1);
}

function buildIndexReturnSeries({
  pricesByDate,
}: {
  pricesByDate: Map<string, number | Decimal | unknown>;
}): Map<string, Decimal> {
  const entries = Array.from(pricesByDate.entries()).sort((a, b) =>
    a[0].localeCompare(b[0]),
  );
  const result = new Map<string, Decimal>();
  for (let i = 1; i < entries.length; i += 1) {
    const entry = entries[i];
    const prevEntry = entries[i - 1];
    if (!entry || !prevEntry) continue;
    const [date, price] = entry;
    const [, prevPrice] = prevEntry;
    const currentPrice = d(price as Decimal.Value);
    const previousPrice = d(prevPrice as Decimal.Value);
    if (previousPrice.lte(0)) {
      result.set(date, ZERO);
    } else {
      result.set(date, currentPrice.dividedBy(previousPrice).minus(1));
    }
  }
  if (entries.length > 0 && entries[0] && !result.has(entries[0][0])) {
    result.set(entries[0][0], ZERO);
  }
  return result;
}

export function buildSpyReturnSeries({
  spyPrices,
}: {
  spyPrices: Map<string, number | unknown>;
}): Map<string, Decimal> {
  return buildIndexReturnSeries({ pricesByDate: spyPrices });
}

export function buildCashReturnSeries({
  policy,
  from,
  to,
}: {
  policy?: unknown;
  from: unknown;
  to: unknown;
}): Map<string, Decimal> {
  const series = buildCashSeries({
    policy: policy as Parameters<typeof buildCashSeries>[0]['policy'],
    from,
    to,
  });
  const map = new Map<string, Decimal>();
  for (const entry of series) {
    map.set(entry.date, roundDecimal(entry.rate, 12));
  }
  return map;
}

function alignFlowsToDates({
  flowsByDate,
  dates,
}: {
  flowsByDate: Map<string, Decimal | number>;
  dates: string[];
}): Map<string, Decimal> {
  if (!(flowsByDate instanceof Map) || flowsByDate.size === 0) {
    return flowsByDate instanceof Map
      ? new Map(flowsByDate as Map<string, Decimal>)
      : new Map<string, Decimal>();
  }
  const sortedDates = [...dates].sort((a, b) => a.localeCompare(b));
  if (sortedDates.length === 0) {
    return new Map(flowsByDate as Map<string, Decimal>);
  }
  const dateSet = new Set(sortedDates);
  const sortedFlows = [...flowsByDate.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  );
  const aligned = new Map<string, Decimal>();

  for (const [dateKey, amount] of sortedFlows) {
    const decimalAmount = d(amount as Decimal.Value ?? 0);
    if (decimalAmount.isZero()) {
      continue;
    }
    let targetDate = dateKey;
    if (!dateSet.has(targetDate)) {
      targetDate =
        sortedDates.find((candidate) => candidate >= dateKey) ??
        sortedDates[sortedDates.length - 1] ??
        dateKey;
    }
    const existing = aligned.get(targetDate);
    aligned.set(
      targetDate,
      existing ? existing.plus(decimalAmount) : decimalAmount,
    );
  }

  for (const dateKey of sortedDates) {
    if (!aligned.has(dateKey) && flowsByDate.has(dateKey)) {
      aligned.set(dateKey, d(flowsByDate.get(dateKey) as Decimal.Value ?? 0));
    }
  }

  return aligned;
}

interface PrepareReturnSeriesResult {
  flowsByDate: Map<string, Decimal>;
  cashReturns: Map<string, Decimal>;
  spyReturnSeries: Map<string, Decimal>;
  qqqReturnSeries: Map<string, Decimal>;
  allSpyReturns: Map<string, Decimal>;
  allQqqReturns: Map<string, Decimal>;
}

function prepareReturnSeries({
  states,
  policy,
  spyPrices,
  qqqPrices,
  transactions,
}: {
  states: DailyStateRow[];
  policy: NormalizedCashPolicy;
  spyPrices: Map<string, number | unknown>;
  qqqPrices: Map<string, number | unknown>;
  transactions: TxRow[];
}): PrepareReturnSeriesResult {
  const dates = states.map((state) => state.date);
  const rawFlows = externalFlowsByDate(transactions as Parameters<typeof externalFlowsByDate>[0]);
  const flowsByDate = alignFlowsToDates({ flowsByDate: rawFlows, dates });
  const cashReturns = buildCashReturnSeries({
    policy,
    from: dates[0],
    to: dates[dates.length - 1],
  });
  const spyReturnSeries = buildSpyReturnSeries({ spyPrices });
  const qqqReturnSeries = buildIndexReturnSeries({ pricesByDate: qqqPrices });
  const { returns: allSpyReturns } = computeAllSpySeries({
    dates,
    flowsByDate,
    spyPrices,
  });
  const { returns: allQqqReturns } = computeAllIndexSeries({
    dates,
    flowsByDate,
    pricesByDate: qqqPrices,
  });

  return {
    flowsByDate,
    cashReturns,
    spyReturnSeries,
    qqqReturnSeries,
    allSpyReturns,
    allQqqReturns,
  };
}

function buildReturnRow({
  state,
  prevState,
  flow,
  cashReturns,
  spyReturnSeries,
  qqqReturnSeries,
  allSpyReturns,
  allQqqReturns,
}: {
  state: DailyStateRow;
  prevState: DailyStateRow | undefined;
  flow: Decimal;
  cashReturns: Map<string, Decimal>;
  spyReturnSeries: Map<string, Decimal>;
  qqqReturnSeries: Map<string, Decimal>;
  allSpyReturns: Map<string, Decimal>;
  allQqqReturns: Map<string, Decimal>;
}): ReturnRow {
  const { rPort, rExCash } = computeRollingReturns({ prevState, state, flow });
  const rCash = cashReturns.get(state.date) ?? ZERO;
  const rSpy = spyReturnSeries.get(state.date) ?? ZERO;
  const rSpy100 = allSpyReturns.get(state.date) ?? rSpy;
  const rQqq = qqqReturnSeries.get(state.date) ?? ZERO;
  const rQqq100 = allQqqReturns.get(state.date) ?? rQqq;
  const weightSource = resolveWeightSource(prevState, flow);
  const rBench = computeBenchmarkReturn({ weightSource, rCash, rSpy });

  return {
    date: state.date,
    r_port: roundDecimal(rPort, 8).toNumber(),
    r_ex_cash: roundDecimal(rExCash, 8).toNumber(),
    r_bench_blended: roundDecimal(rBench, 8).toNumber(),
    r_spy_100: roundDecimal(rSpy100, 8).toNumber(),
    r_qqq_100: roundDecimal(rQqq100, 8).toNumber(),
    r_cash: roundDecimal(rCash, 8).toNumber(),
  };
}

interface AllIndexSeriesResult {
  returns: Map<string, Decimal>;
  navByDate: Map<string, Decimal>;
}

export function computeAllSpySeries({
  dates,
  flowsByDate,
  spyPrices,
}: {
  dates: string[];
  flowsByDate: Map<string, Decimal | number>;
  spyPrices: Map<string, number | unknown>;
}): AllIndexSeriesResult {
  return computeAllIndexSeries({ dates, flowsByDate, pricesByDate: spyPrices });
}

function computeAllIndexSeries({
  dates,
  flowsByDate,
  pricesByDate,
}: {
  dates: string[];
  flowsByDate: Map<string, Decimal | number>;
  pricesByDate: Map<string, number | unknown>;
}): AllIndexSeriesResult {
  const prices = Array.from(pricesByDate.entries()).sort((a, b) =>
    a[0].localeCompare(b[0]),
  );
  const priceMap = new Map(prices);
  let prevDate: string | null = null;
  let prevNavCents = 0;
  const returns = new Map<string, Decimal>();
  const navByDate = new Map<string, Decimal>();

  for (const date of dates) {
    const price = priceMap.get(date);
    if (price === undefined) {
      returns.set(date, ZERO);
      navByDate.set(date, fromCents(prevNavCents));
      continue;
    }

    if (!prevDate) {
      const flow = flowsByDate.get(date) ?? ZERO;
      prevNavCents = toCents(d(flow as Decimal.Value));
      navByDate.set(date, fromCents(prevNavCents));
      returns.set(date, ZERO);
      prevDate = date;
      continue;
    }

    const prevPrice = priceMap.get(prevDate) ?? price;
    const flow = flowsByDate.get(date) ?? ZERO;
    const navBeforeFlows = fromCents(prevNavCents)
      .times(d(price as Decimal.Value))
      .dividedBy(d(prevPrice as Decimal.Value).isZero() ? 1 : d(prevPrice as Decimal.Value));
    const navBeforeCents = toCents(navBeforeFlows);
    const navAfterCents = navBeforeCents + toCents(d(flow as Decimal.Value));
    const dailyReturn = computeReturnStep(
      fromCents(prevNavCents),
      fromCents(navBeforeCents),
      ZERO,
    );
    returns.set(date, dailyReturn);
    navByDate.set(date, fromCents(navAfterCents));
    prevNavCents = navAfterCents;
    prevDate = date;
  }

  return { returns, navByDate };
}

function computeInceptionReturns({
  flow: _flow,
  state: _state,
}: {
  flow: Decimal;
  state: DailyStateRow;
}): { rPort: Decimal; rExCash: Decimal } {
  return { rPort: ZERO, rExCash: ZERO };
}

function computeRollingReturns({
  prevState,
  state,
  flow,
}: {
  prevState: DailyStateRow | undefined;
  state: DailyStateRow;
  flow: Decimal;
}): { rPort: Decimal; rExCash: Decimal } {
  if (!prevState) {
    return computeInceptionReturns({ flow, state });
  }

  return {
    rPort: computeReturnStep(prevState.nav, state.nav, flow),
    rExCash: computeReturnStep(prevState.riskValue, state.riskValue, ZERO),
  };
}

function resolveWeightSource(
  prevState: DailyStateRow | undefined,
  flow: Decimal,
): { nav: number; cash: number } {
  if (prevState) {
    return prevState;
  }
  if (flow.gt(0)) {
    const bootstrap = flow.toNumber();
    return { nav: bootstrap, cash: bootstrap };
  }
  return { nav: 1, cash: 1 };
}

function computeBenchmarkReturn({
  weightSource,
  rCash,
  rSpy,
}: {
  weightSource: { nav: number; cash: number };
  rCash: Decimal;
  rSpy: Decimal;
}): Decimal {
  const weightCash = d(weightSource.cash).dividedBy(weightSource.nav || 1);
  return roundDecimal(
    weightCash.times(rCash).plus(d(1).minus(weightCash).times(rSpy)),
    10,
  );
}

export function computeDailyReturnRows({
  states,
  rates,
  spyPrices,
  qqqPrices = new Map<string, number>(),
  transactions,
  cashPolicy,
}: {
  states: DailyStateRow[];
  rates?: unknown;
  spyPrices: Map<string, number | unknown>;
  qqqPrices?: Map<string, number | unknown>;
  transactions: TxRow[];
  cashPolicy?: unknown;
}): ReturnRow[] {
  if (states.length === 0) {
    return [];
  }

  const policy = normalizeCashPolicy(cashPolicy ?? rates);
  const context = prepareReturnSeries({
    states,
    policy,
    spyPrices,
    qqqPrices,
    transactions,
  });

  return states.map((state, index) => {
    const prevState = states[index - 1];
    const flow = context.flowsByDate.get(state.date) ?? ZERO;
    return buildReturnRow({
      state,
      prevState,
      flow,
      cashReturns: context.cashReturns,
      spyReturnSeries: context.spyReturnSeries,
      qqqReturnSeries: context.qqqReturnSeries,
      allSpyReturns: context.allSpyReturns,
      allQqqReturns: context.allQqqReturns,
    });
  });
}

export function summarizeReturns(rows: ReturnRow[]): SummarizedReturns {
  const summary = {
    r_port: d(1),
    r_ex_cash: d(1),
    r_bench_blended: d(1),
    r_spy_100: d(1),
    r_qqq_100: d(1),
    r_cash: d(1),
  };
  for (const row of rows) {
    summary.r_port = summary.r_port.times(d(1).plus(row.r_port));
    summary.r_ex_cash = summary.r_ex_cash.times(d(1).plus(row.r_ex_cash));
    summary.r_bench_blended = summary.r_bench_blended.times(
      d(1).plus(row.r_bench_blended),
    );
    summary.r_spy_100 = summary.r_spy_100.times(d(1).plus(row.r_spy_100));
    summary.r_qqq_100 = summary.r_qqq_100.times(d(1).plus(row.r_qqq_100 ?? 0));
    summary.r_cash = summary.r_cash.times(d(1).plus(row.r_cash));
  }
  const cumulative: SummarizedReturns = {
    r_port: roundDecimal(summary.r_port.minus(1), 6).toNumber(),
    r_ex_cash: roundDecimal(summary.r_ex_cash.minus(1), 6).toNumber(),
    r_bench_blended: roundDecimal(summary.r_bench_blended.minus(1), 6).toNumber(),
    r_spy_100: roundDecimal(summary.r_spy_100.minus(1), 6).toNumber(),
    r_qqq_100: roundDecimal(summary.r_qqq_100.minus(1), 6).toNumber(),
    r_cash: roundDecimal(summary.r_cash.minus(1), 6).toNumber(),
  };
  if (rows.length >= 2 && rows[0]?.date && rows[rows.length - 1]?.date) {
    const startMs = new Date(`${rows[0].date}T00:00:00Z`).getTime();
    const endMs = new Date(`${rows[rows.length - 1]!.date}T00:00:00Z`).getTime();
    const days = Math.round((endMs - startMs) / MS_PER_DAY);
    if (days >= 365) {
      cumulative.annualized_r_port = annualizeReturn(cumulative.r_port, days);
      cumulative.annualized_r_ex_cash = annualizeReturn(cumulative.r_ex_cash, days);
      cumulative.annualized_r_bench_blended = annualizeReturn(
        cumulative.r_bench_blended,
        days,
      );
      cumulative.annualized_r_spy_100 = annualizeReturn(cumulative.r_spy_100, days);
      cumulative.annualized_r_qqq_100 = annualizeReturn(cumulative.r_qqq_100, days);
      cumulative.annualized_r_cash = annualizeReturn(cumulative.r_cash, days);
    }
  }
  return cumulative;
}

// ---------------------------------------------------------------------------
// XIRR / Money-Weighted Return helpers
// ---------------------------------------------------------------------------

function normalizeToUtcDate(value: unknown): Date {
  if (value instanceof Date) {
    return new Date(value.getTime());
  }
  if (typeof value === 'number') {
    return new Date(value);
  }
  if (typeof value === 'string') {
    return new Date(`${value}T00:00:00Z`);
  }
  return new Date(value as string);
}

function computeYearFraction(startDate: Date, currentDate: Date): Decimal {
  const diffMs = currentDate.getTime() - startDate.getTime();
  return d(diffMs).div(MS_PER_DAY).div(365);
}

function evaluateNpv(
  flows: PreparedXirrFlow[],
  rate: number,
): Decimal {
  if (rate <= -0.999999) {
    return d(Number.POSITIVE_INFINITY);
  }
  const onePlusRate = d(1).plus(rate);
  let total = ZERO;
  for (const flow of flows) {
    const discount = onePlusRate.pow(flow.years);
    total = total.plus(flow.amount.dividedBy(discount));
  }
  return total;
}

function computeXirr(
  flows: XirrFlowInput[],
  { tolerance = 1e-7, maxIterations = 100 }: { tolerance?: number; maxIterations?: number } = {},
): Decimal {
  const prepared: PreparedXirrFlow[] = flows
    .map((flow) => ({
      date: normalizeToUtcDate(flow.date),
      amount: d(flow.amount as Decimal.Value ?? 0),
      years: ZERO,
    }))
    .filter((flow) => flow.amount.isFinite() && !flow.amount.isZero())
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (prepared.length < 2) {
    return ZERO;
  }

  const earliest = prepared[0]!.date;
  for (const flow of prepared) {
    flow.years = computeYearFraction(earliest, flow.date);
  }

  const hasPositive = prepared.some((flow) => flow.amount.gt(0));
  const hasNegative = prepared.some((flow) => flow.amount.lt(0));
  if (!hasPositive || !hasNegative) {
    return ZERO;
  }

  let low = -0.999;
  let high = 0.5;
  let npvLow = evaluateNpv(prepared, low);
  let npvHigh = evaluateNpv(prepared, high);

  for (let expand = 0; expand < 128 && npvLow.times(npvHigh).gt(0); expand += 1) {
    if (npvLow.gt(0) && npvHigh.gt(0)) {
      high += 1;
      npvHigh = evaluateNpv(prepared, high);
      continue;
    }
    if (npvLow.lt(0) && npvHigh.lt(0)) {
      const nextLow = Math.max(-0.9999, low - 0.5);
      if (nextLow === low) {
        break;
      }
      low = nextLow;
      npvLow = evaluateNpv(prepared, low);
      continue;
    }
    break;
  }

  if (npvLow.isZero()) {
    return roundDecimal(d(low), 12);
  }
  if (npvHigh.isZero()) {
    return roundDecimal(d(high), 12);
  }
  if (npvLow.times(npvHigh).gt(0)) {
    return ZERO;
  }

  const toleranceDecimal = d(tolerance);
  let result = (low + high) / 2;

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const mid = (low + high) / 2;
    const npvMid = evaluateNpv(prepared, mid);

    if (npvMid.abs().lte(toleranceDecimal)) {
      result = mid;
      break;
    }

    if (npvLow.times(npvMid).lt(0)) {
      high = mid;
      npvHigh = npvMid;
      result = mid;
    } else {
      low = mid;
      npvLow = npvMid;
      result = mid;
    }
  }

  return roundDecimal(d(result), 12);
}

function addMoneyWeightedFlow(
  flows: Map<string, Decimal>,
  dateKey: string | null | undefined,
  amount: Decimal | number | null | undefined,
): void {
  const decimalAmount = d(amount as Decimal.Value ?? 0);
  if (!dateKey || !decimalAmount.isFinite() || decimalAmount.isZero()) {
    return;
  }
  const existing = flows.get(dateKey) ?? ZERO;
  flows.set(dateKey, existing.plus(decimalAmount));
}

function buildMoneyWeightedFlowEntries({
  startDate,
  endDate,
  initialCapital,
  externalFlows,
  terminalValue,
}: {
  startDate: string;
  endDate: string;
  initialCapital: Decimal | number;
  externalFlows: Map<string, Decimal | number>;
  terminalValue: Decimal | number;
}): MoneyWeightedFlowEntry[] {
  const flows = new Map<string, Decimal>();
  addMoneyWeightedFlow(flows, startDate, d(initialCapital as Decimal.Value ?? 0).neg());

  for (const [dateKey, flow] of externalFlows.entries()) {
    addMoneyWeightedFlow(flows, dateKey, d(flow as Decimal.Value ?? 0).neg());
  }

  const terminal = d(terminalValue as Decimal.Value ?? 0);
  if (terminal.gt(0) || flows.has(endDate)) {
    addMoneyWeightedFlow(flows, endDate, terminal);
  }

  return Array.from(flows.entries())
    .map(([date, amount]) => ({ date, amount }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function canComputeXirr(flowEntries: MoneyWeightedFlowEntry[]): boolean {
  if (!Array.isArray(flowEntries) || flowEntries.length < 2) {
    return false;
  }
  const nonZeroEntries = flowEntries.filter(
    (entry) => d(entry?.amount ?? 0).isZero() === false,
  );
  if (nonZeroEntries.length < 2) {
    return false;
  }
  const hasPositive = nonZeroEntries.some((entry) => d(entry.amount).gt(0));
  const hasNegative = nonZeroEntries.some((entry) => d(entry.amount).lt(0));
  return hasPositive && hasNegative;
}

function filterExternalFlowsInRange(
  flowsByDate: Map<string, Decimal | number>,
  {
    startKey,
    endKey,
    excludeStartDate = false,
  }: { startKey: string; endKey: string; excludeStartDate?: boolean } = {
    startKey: '',
    endKey: '',
  },
): Map<string, Decimal> {
  const filtered = new Map<string, Decimal>();
  if (!(flowsByDate instanceof Map)) {
    return filtered;
  }
  for (const [dateKey, flow] of flowsByDate.entries()) {
    if (!dateKey || dateKey < startKey || dateKey > endKey) {
      continue;
    }
    if (excludeStartDate && dateKey === startKey) {
      continue;
    }
    addMoneyWeightedFlow(filtered, dateKey, flow);
  }
  return filtered;
}

function normalizeBenchmarkPriceMap(
  benchmarkPrices: Map<string, number | unknown>,
  { startKey, endKey }: { startKey: string; endKey: string },
): Map<string, Decimal> {
  if (!(benchmarkPrices instanceof Map)) {
    return new Map<string, Decimal>();
  }
  const entries = Array.from(benchmarkPrices.entries())
    .map(([dateKey, price]): [string, Decimal] => [dateKey, d(price as Decimal.Value ?? 0)])
    .filter(
      ([dateKey, price]) =>
        typeof dateKey === 'string'
        && dateKey >= startKey
        && dateKey <= endKey
        && price.isFinite()
        && price.gt(0),
    )
    .sort((a, b) => a[0].localeCompare(b[0]));
  return new Map(entries);
}

export function computeMoneyWeightedReturn({
  transactions,
  navRows,
  startDate,
  endDate,
}: {
  transactions?: TxRow[];
  navRows: NavRow[];
  startDate: string | Date | unknown;
  endDate: string | Date | unknown;
}): Decimal {
  if (!Array.isArray(navRows) || navRows.length === 0 || !startDate || !endDate) {
    return ZERO;
  }
  const startKey = toDateKey(startDate);
  const endKey = toDateKey(endDate);
  if (!startKey || !endKey) {
    return ZERO;
  }

  const navByDate = new Map(
    navRows.map((row) => [row.date, d(row.portfolio_nav ?? 0)]),
  );
  const flowsByDate = externalFlowsByDate(
    (transactions ?? []) as Parameters<typeof externalFlowsByDate>[0],
  );
  const startNav = navByDate.get(startKey) ?? ZERO;
  const endNav = navByDate.get(endKey) ?? ZERO;
  const windowFlows = filterExternalFlowsInRange(flowsByDate, {
    startKey,
    endKey,
    excludeStartDate: true,
  });
  const flowEntries = buildMoneyWeightedFlowEntries({
    startDate: startKey,
    endDate: endKey,
    initialCapital: startNav,
    externalFlows: windowFlows,
    terminalValue: endNav,
  });

  if (!canComputeXirr(flowEntries)) {
    return ZERO;
  }

  return computeXirr(flowEntries);
}

export function computeMatchedBenchmarkMoneyWeightedReturn({
  benchmarkPrices,
  transactions,
  navRows,
  startDate,
  endDate,
}: {
  benchmarkPrices: Map<string, number | unknown>;
  transactions?: TxRow[];
  navRows: NavRow[];
  startDate: string | Date | unknown;
  endDate: string | Date | unknown;
}): Decimal | null {
  if (!Array.isArray(navRows) || navRows.length === 0 || !startDate || !endDate) {
    return null;
  }
  const startKey = toDateKey(startDate);
  const endKey = toDateKey(endDate);
  if (!startKey || !endKey || startKey > endKey) {
    return null;
  }

  const navByDate = new Map(
    navRows.map((row) => [row.date, d(row.portfolio_nav ?? 0)]),
  );
  const startNav = navByDate.get(startKey) ?? ZERO;
  if (!startNav.isFinite() || startNav.lte(0)) {
    return null;
  }

  const priceMap = normalizeBenchmarkPriceMap(benchmarkPrices, { startKey, endKey });
  const priceDates = Array.from(priceMap.keys()).sort((a, b) =>
    a.localeCompare(b),
  );
  if (priceDates.length === 0) {
    return null;
  }

  const startPrice = priceMap.get(startKey) ?? ZERO;
  const endPrice = priceMap.get(endKey) ?? ZERO;
  if (
    !startPrice.isFinite()
    || startPrice.lte(0)
    || !endPrice.isFinite()
    || endPrice.lte(0)
  ) {
    return null;
  }

  const rawFlows = filterExternalFlowsInRange(
    externalFlowsByDate(
      (transactions ?? []) as Parameters<typeof externalFlowsByDate>[0],
    ),
    {
      startKey,
      endKey,
      excludeStartDate: true,
    },
  );
  const alignedFlows = alignFlowsToDates({
    flowsByDate: rawFlows,
    dates: priceDates,
  });

  let shares = startNav.dividedBy(startPrice);
  for (const dateKey of priceDates) {
    const flow = alignedFlows.get(dateKey) ?? ZERO;
    if (flow.isZero()) {
      continue;
    }
    const price = priceMap.get(dateKey) ?? ZERO;
    if (!price.isFinite() || price.lte(0)) {
      return null;
    }
    shares = shares.plus(flow.dividedBy(price));
  }

  if (!shares.isFinite()) {
    return null;
  }

  const terminalValue = shares.times(endPrice);
  if (!terminalValue.isFinite() || terminalValue.lt(0)) {
    return null;
  }

  const flowEntries = buildMoneyWeightedFlowEntries({
    startDate: startKey,
    endDate: endKey,
    initialCapital: startNav,
    externalFlows: alignedFlows,
    terminalValue,
  });
  if (!canComputeXirr(flowEntries)) {
    return null;
  }

  return computeXirr(flowEntries);
}

export function cumulativeDifference(rows: ReturnRow[]): number {
  let drag = d(1);
  let blended = d(1);
  for (const row of rows) {
    drag = drag.times(d(1).plus(row.r_ex_cash));
    blended = blended.times(d(1).plus(row.r_port));
  }
  return roundDecimal(drag.minus(blended).dividedBy(blended), 6).toNumber();
}

import { buildCashSeries } from './cash.js';
import { externalFlowsByDate } from './portfolio.js';
import { d, fromCents, roundDecimal, toCents, ZERO } from './decimal.js';

export function computeReturnStep(prevNav, nav, flow) {
  const prev = d(prevNav);
  if (prev.lte(0)) {
    return ZERO;
  }
  return d(nav).minus(flow).dividedBy(prev).minus(1);
}

export function buildSpyReturnSeries({ spyPrices }) {
  const entries = Array.from(spyPrices.entries()).sort((a, b) =>
    a[0].localeCompare(b[0]),
  );
  const result = new Map();
  for (let i = 1; i < entries.length; i += 1) {
    const [date, price] = entries[i];
    const [, prevPrice] = entries[i - 1];
    const currentPrice = d(price);
    const previousPrice = d(prevPrice);
    if (previousPrice.lte(0)) {
      result.set(date, ZERO);
    } else {
      result.set(date, currentPrice.dividedBy(previousPrice).minus(1));
    }
  }
  if (entries.length > 0 && !result.has(entries[0][0])) {
    result.set(entries[0][0], ZERO);
  }
  return result;
}

export function buildCashReturnSeries({ rates, from, to }) {
  const series = buildCashSeries({ rates, from, to });
  const map = new Map();
  for (const entry of series) {
    map.set(entry.date, roundDecimal(entry.rate, 12));
  }
  return map;
}

export function computeAllSpySeries({ dates, flowsByDate, spyPrices }) {
  const prices = Array.from(spyPrices.entries()).sort((a, b) =>
    a[0].localeCompare(b[0]),
  );
  const priceMap = new Map(prices);
  let prevDate = null;
  let prevNavCents = 0;
  const returns = new Map();
  const navByDate = new Map();

  for (const date of dates) {
    const price = priceMap.get(date);
    if (price === undefined) {
      returns.set(date, ZERO);
      navByDate.set(date, fromCents(prevNavCents));
      continue;
    }

    if (!prevDate) {
      const flow = flowsByDate.get(date) ?? ZERO;
      prevNavCents = toCents(flow);
      navByDate.set(date, fromCents(prevNavCents));
      returns.set(date, ZERO);
      prevDate = date;
      continue;
    }

    const prevPrice = priceMap.get(prevDate) ?? price;
    const flow = flowsByDate.get(date) ?? ZERO;
    const navBeforeFlows = fromCents(prevNavCents)
      .times(price)
      .dividedBy(prevPrice === 0 ? 1 : prevPrice);
    const navBeforeCents = toCents(navBeforeFlows);
    const navAfterCents = navBeforeCents + toCents(flow);
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

export function computeDailyReturnRows({
  states,
  rates,
  spyPrices,
  transactions,
}) {
  if (states.length === 0) {
    return [];
  }

  const dates = states.map((state) => state.date);
  const flowsByDate = externalFlowsByDate(transactions);
  const cashReturns = buildCashReturnSeries({
    rates,
    from: dates[0],
    to: dates[dates.length - 1],
  });
  const spyReturnSeries = buildSpyReturnSeries({ spyPrices });
  const { returns: allSpyReturns } = computeAllSpySeries({
    dates,
    flowsByDate,
    spyPrices,
  });

  const rows = [];

  for (let i = 0; i < states.length; i += 1) {
    const state = states[i];
    const prevState = states[i - 1];
    const flow = flowsByDate.get(state.date) ?? ZERO;

    let rPort = ZERO;
    let rExCash = ZERO;

    if (prevState) {
      rPort = computeReturnStep(prevState.nav, state.nav, flow);
      rExCash = computeReturnStep(prevState.riskValue, state.riskValue, ZERO);
    } else {
      const inceptionCapital = flow;

      if (inceptionCapital.gt(0) && state.nav > 0) {
        rPort = d(state.nav).minus(flow).dividedBy(inceptionCapital);
        rExCash =
          inceptionCapital.gt(0) && state.riskValue > 0
            ? d(state.riskValue)
                .minus(inceptionCapital.minus(flow))
                .dividedBy(inceptionCapital)
            : ZERO;
      }
    }

    const rCash = cashReturns.get(state.date) ?? ZERO;
    const rSpy = spyReturnSeries.get(state.date) ?? ZERO;
    const rSpy100 = allSpyReturns.get(state.date) ?? rSpy;

    const weightSource = prevState ?? {
      nav: flow.gt(0) ? flow.toNumber() : 1,
      cash: flow.gt(0) ? flow.toNumber() : 1,
    };

    const weightCash = d(weightSource.cash).dividedBy(weightSource.nav || 1);
    const rBench = roundDecimal(
      weightCash.times(rCash).plus(d(1).minus(weightCash).times(rSpy)),
      10,
    );

    rows.push({
      date: state.date,
      r_port: roundDecimal(rPort, 8).toNumber(),
      r_ex_cash: roundDecimal(rExCash, 8).toNumber(),
      r_bench_blended: roundDecimal(rBench, 8).toNumber(),
      r_spy_100: roundDecimal(rSpy100, 8).toNumber(),
      r_cash: roundDecimal(rCash, 8).toNumber(),
    });
  }

  return rows;
}

export function summarizeReturns(rows) {
  const summary = {
    r_port: d(1),
    r_ex_cash: d(1),
    r_bench_blended: d(1),
    r_spy_100: d(1),
    r_cash: d(1),
  };
  for (const row of rows) {
    summary.r_port = summary.r_port.times(d(1).plus(row.r_port));
    summary.r_ex_cash = summary.r_ex_cash.times(d(1).plus(row.r_ex_cash));
    summary.r_bench_blended = summary.r_bench_blended.times(
      d(1).plus(row.r_bench_blended),
    );
    summary.r_spy_100 = summary.r_spy_100.times(d(1).plus(row.r_spy_100));
    summary.r_cash = summary.r_cash.times(d(1).plus(row.r_cash));
  }
  return {
    r_port: roundDecimal(summary.r_port.minus(1), 6).toNumber(),
    r_ex_cash: roundDecimal(summary.r_ex_cash.minus(1), 6).toNumber(),
    r_bench_blended: roundDecimal(summary.r_bench_blended.minus(1), 6).toNumber(),
    r_spy_100: roundDecimal(summary.r_spy_100.minus(1), 6).toNumber(),
    r_cash: roundDecimal(summary.r_cash.minus(1), 6).toNumber(),
  };
}

export function cumulativeDifference(rows) {
  let drag = d(1);
  let blended = d(1);
  for (const row of rows) {
    drag = drag.times(d(1).plus(row.r_ex_cash));
    blended = blended.times(d(1).plus(row.r_port));
  }
  return roundDecimal(drag.minus(blended).dividedBy(blended), 6).toNumber();
}

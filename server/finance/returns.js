import { buildCashSeries } from './cash.js';
import { externalFlowsByDate } from './portfolio.js';

export function computeReturnStep(prevNav, nav, flow) {
  if (prevNav <= 0) {
    return 0;
  }
  return Number(((nav - flow) / prevNav - 1).toFixed(8));
}

export function buildSpyReturnSeries({ spyPrices }) {
  const entries = Array.from(spyPrices.entries()).sort((a, b) =>
    a[0].localeCompare(b[0]),
  );
  const result = new Map();
  for (let i = 1; i < entries.length; i += 1) {
    const [date, price] = entries[i];
    const [, prevPrice] = entries[i - 1];
    if (prevPrice === 0) {
      result.set(date, 0);
    } else {
      result.set(date, Number((price / prevPrice - 1).toFixed(8)));
    }
  }
  if (entries.length > 0 && !result.has(entries[0][0])) {
    result.set(entries[0][0], 0);
  }
  return result;
}

export function buildCashReturnSeries({ rates, from, to }) {
  const series = buildCashSeries({ rates, from, to });
  const map = new Map();
  for (const entry of series) {
    map.set(entry.date, Number(entry.rate.toFixed(8)));
  }
  return map;
}

export function computeAllSpySeries({ dates, flowsByDate, spyPrices }) {
  const prices = Array.from(spyPrices.entries()).sort((a, b) =>
    a[0].localeCompare(b[0]),
  );
  const priceMap = new Map(prices);
  let prevDate = null;
  let prevNav = 0;
  const returns = new Map();
  const navByDate = new Map();

  for (const date of dates) {
    const price = priceMap.get(date);
    if (price === undefined) {
      returns.set(date, 0);
      navByDate.set(date, prevNav);
      continue;
    }

    if (!prevDate) {
      const flow = flowsByDate.get(date) ?? 0;
      prevNav = flow;
      navByDate.set(date, flow);
      returns.set(date, 0);
      prevDate = date;
      continue;
    }

    const prevPrice = priceMap.get(prevDate) ?? price;
    const flow = flowsByDate.get(date) ?? 0;
    const navBeforeFlows = prevNav * (prevPrice === 0 ? 1 : price / prevPrice);
    const navAfter = navBeforeFlows + flow;
    const dailyReturn = computeReturnStep(prevNav, navBeforeFlows, 0);
    returns.set(date, dailyReturn);
    navByDate.set(date, navAfter);
    prevNav = navAfter;
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
    const flow = flowsByDate.get(state.date) ?? 0;

    let rPort;
    let rExCash;

    if (prevState) {
      rPort = computeReturnStep(prevState.nav, state.nav, flow);
      rExCash = computeReturnStep(prevState.riskValue, state.riskValue, 0);
    } else {
      const inceptionCapital = flow;

      if (inceptionCapital > 0 && state.nav > 0) {
        rPort = (state.nav - flow) / inceptionCapital;
        rExCash =
          inceptionCapital > 0 && state.riskValue > 0
            ? (state.riskValue - (inceptionCapital - flow)) / inceptionCapital
            : 0;
      } else {
        rPort = 0;
        rExCash = 0;
      }
    }

    const rCash = cashReturns.get(state.date) ?? 0;
    const rSpy = spyReturnSeries.get(state.date) ?? 0;
    const rSpy100 = allSpyReturns.get(state.date) ?? rSpy;

    const weightSource = prevState ?? {
      nav: flow > 0 ? flow : 1,
      cash: flow > 0 ? flow : 1,
    };

    const weightCash = weightSource.nav === 0 ? 0 : weightSource.cash / weightSource.nav;
    const rBench = Number((weightCash * rCash + (1 - weightCash) * rSpy).toFixed(8));

    rows.push({
      date: state.date,
      r_port: Number(rPort.toFixed(8)),
      r_ex_cash: Number(rExCash.toFixed(8)),
      r_bench_blended: rBench,
      r_spy_100: rSpy100,
      r_cash: rCash,
    });
  }

  return rows;
}

export function summarizeReturns(rows) {
  const summary = {
    r_port: 1,
    r_ex_cash: 1,
    r_bench_blended: 1,
    r_spy_100: 1,
    r_cash: 1,
  };
  for (const row of rows) {
    summary.r_port *= 1 + row.r_port;
    summary.r_ex_cash *= 1 + row.r_ex_cash;
    summary.r_bench_blended *= 1 + row.r_bench_blended;
    summary.r_spy_100 *= 1 + row.r_spy_100;
    summary.r_cash *= 1 + row.r_cash;
  }
  return {
    r_port: Number((summary.r_port - 1).toFixed(6)),
    r_ex_cash: Number((summary.r_ex_cash - 1).toFixed(6)),
    r_bench_blended: Number((summary.r_bench_blended - 1).toFixed(6)),
    r_spy_100: Number((summary.r_spy_100 - 1).toFixed(6)),
    r_cash: Number((summary.r_cash - 1).toFixed(6)),
  };
}

export function cumulativeDifference(rows) {
  let drag = 1;
  let blended = 1;
  for (const row of rows) {
    drag *= 1 + row.r_ex_cash;
    blended *= 1 + row.r_port;
  }
  return Number(((drag - blended) / blended).toFixed(6));
}

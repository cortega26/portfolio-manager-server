// @ts-nocheck
import fc from 'fast-check';

import { toDateKey } from '../finance/cash.js';

export const DAY_MS = 86_400_000;

export const planArb = fc.record({
  initialNav: fc.double({ min: 500, max: 25000, noNaN: true }),
  initialCashWeight: fc.double({ min: 0.05, max: 0.9, noNaN: true }),
  steps: fc.array(
    fc.record({
      spyReturn: fc.double({ min: -0.04, max: 0.04, noNaN: true }),
      flow: fc.double({ min: -6000, max: 6000, noNaN: true }),
    }),
    { minLength: 2, maxLength: 8 },
  ),
});

export function round(value, decimals = 6) {
  return Number.parseFloat(value.toFixed(decimals));
}

export function buildScenario(plan) {
  const baseDate = new Date('2024-01-01T00:00:00Z');
  const dates = [toDateKey(baseDate)];
  for (let i = 0; i < plan.steps.length; i += 1) {
    dates.push(toDateKey(new Date(baseDate.getTime() + (i + 1) * DAY_MS)));
  }

  const transactions = [
    {
      id: 'seed-initial',
      type: 'DEPOSIT',
      ticker: 'CASH',
      date: dates[0],
      amount: round(plan.initialNav, 6),
    },
  ];
  const rates = dates.map((date) => ({ effective_date: date, apy: 0 }));
  const spyPrices = new Map();
  spyPrices.set(dates[0], 100);

  let cash = plan.initialNav * plan.initialCashWeight;
  let risk = plan.initialNav - cash;
  const states = [
    {
      date: dates[0],
      nav: round(cash + risk),
      cash: round(cash),
      riskValue: round(risk),
    },
  ];

  for (let index = 0; index < plan.steps.length; index += 1) {
    const step = plan.steps[index];
    const date = dates[index + 1];
    const prevState = states[index];

    const maxWithdrawal = Math.min(prevState.nav * 0.95, cash);
    let flow = step.flow;
    if (flow < 0 && Math.abs(flow) > maxWithdrawal) {
      flow = -maxWithdrawal;
    }
    const maxDeposit = prevState.nav * 0.9;
    if (flow > maxDeposit) {
      flow = maxDeposit;
    }

    const roundedFlow = round(flow, 2);
    if (Math.abs(roundedFlow) > 0.009) {
      transactions.push({
        id: `flow-${date}`,
        type: flow >= 0 ? 'DEPOSIT' : 'WITHDRAWAL',
        ticker: 'CASH',
        date,
        amount: round(Math.abs(roundedFlow), 2),
      });
    }

    cash = Math.max(0, cash + roundedFlow);
    risk = Math.max(0, risk * (1 + step.spyReturn));
    const nav = Math.max(1, cash + risk);

    const prevPrice = spyPrices.get(dates[index]) ?? 100;
    const nextPrice = Math.max(1, prevPrice * (1 + step.spyReturn));
    spyPrices.set(date, round(nextPrice, 6));

    states.push({
      date,
      nav: round(nav),
      cash: round(cash),
      riskValue: round(risk),
    });
  }

  return { states, rates, spyPrices, transactions };
}

export function computeSpyReturns(spyPrices) {
  const entries = Array.from(spyPrices.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const returns = new Map();
  for (let i = 1; i < entries.length; i += 1) {
    const [date, price] = entries[i];
    const [, prevPrice] = entries[i - 1];
    returns.set(date, price / prevPrice - 1);
  }
  if (entries.length > 0) {
    returns.set(entries[0][0], 0);
  }
  return returns;
}

export function scaleScenario(scenario, factor) {
  const states = scenario.states.map((state) => ({
    ...state,
    nav: round(state.nav * factor),
    cash: round(state.cash * factor),
    riskValue: round(state.riskValue * factor),
  }));
  const transactions = scenario.transactions.map((tx) => ({
    ...tx,
    amount: round(tx.amount * factor, 2),
  }));
  return { ...scenario, states, transactions };
}

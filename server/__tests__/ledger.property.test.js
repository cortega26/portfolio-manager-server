import assert from 'node:assert/strict';
import { test } from 'node:test';

import fc from 'fast-check';

import { toDateKey } from '../finance/cash.js';
import {
  computeDailyStates,
  sortTransactions,
  externalFlowsByDate,
} from '../finance/portfolio.js';
import { computeDailyReturnRows, computeReturnStep } from '../finance/returns.js';
import {
  d,
  fromCents,
  fromMicroShares,
  toCents,
  toMicroShares,
} from '../finance/decimal.js';

const DAY_MS = 86_400_000;
const TICKERS = ['SPY', 'QQQ', 'IWM'];

const dayPlanArb = fc.record({
  deposit: fc.double({ min: 0, max: 20000, noNaN: true }),
  withdrawFraction: fc.double({ min: 0, max: 1, noNaN: true }),
  prices: fc.array(fc.double({ min: 5, max: 750, noNaN: true }), {
    minLength: TICKERS.length,
    maxLength: TICKERS.length,
  }),
  buyInstructions: fc.array(
    fc.record({
      tickerIndex: fc.integer({ min: 0, max: TICKERS.length - 1 }),
      fraction: fc.double({ min: 0, max: 0.6, noNaN: true }),
    }),
    { maxLength: 4 },
  ),
  sellInstructions: fc.array(
    fc.record({
      tickerIndex: fc.integer({ min: 0, max: TICKERS.length - 1 }),
      fraction: fc.double({ min: 0, max: 1, noNaN: true }),
    }),
    { maxLength: 4 },
  ),
});

const ledgerPlanArb = fc.array(dayPlanArb, { minLength: 5, maxLength: 20 });

const ratePlanArb = fc.array(
  fc.record({
    offset: fc.integer({ min: 0, max: 30 }),
    apy: fc.double({ min: 0, max: 0.12, noNaN: true }),
  }),
  { minLength: 1, maxLength: 6 },
);

function dateKeyFromOffset(baseDate, offset) {
  return toDateKey(new Date(baseDate.getTime() + offset * DAY_MS));
}

function toPriceMap(prices) {
  const map = new Map();
  for (let i = 0; i < TICKERS.length; i += 1) {
    const ticker = TICKERS[i];
    const price = Number.parseFloat(prices[i]?.toFixed(4) ?? '0');
    map.set(ticker, Number.isFinite(price) && price > 0 ? price : 100);
  }
  return map;
}

test('ledger transactions preserve invariants under random scenarios', async () => {
  await fc.assert(
    fc.property(ledgerPlanArb, ratePlanArb, (plans, ratePlans) => {
      const baseDate = new Date('2024-01-01T00:00:00Z');
      const dates = plans.map((_, index) => dateKeyFromOffset(baseDate, index));

      const pricesByDate = new Map();
      for (let i = 0; i < plans.length; i += 1) {
        pricesByDate.set(dates[i], toPriceMap(plans[i].prices));
      }

      const transactions = [];
      const holdingsMicro = new Map(TICKERS.map((ticker) => [ticker, 0]));
      let cashCents = 0;

      for (let dayIndex = 0; dayIndex < plans.length; dayIndex += 1) {
        const plan = plans[dayIndex];
        const date = dates[dayIndex];
        const prices = pricesByDate.get(date) ?? new Map();

        if (dayIndex === 0) {
          const seedDepositCents = toCents(10000);
          cashCents += seedDepositCents;
          transactions.push({
            id: `seed-${date}`,
            date,
            type: 'DEPOSIT',
            amount: fromCents(seedDepositCents).toNumber(),
          });
        }

        const depositCents = toCents(plan.deposit);
        if (depositCents > 0) {
          cashCents += depositCents;
          transactions.push({
            id: `deposit-${date}-${depositCents}`,
            date,
            type: 'DEPOSIT',
            amount: fromCents(depositCents).toNumber(),
          });
        }

        for (const instruction of plan.buyInstructions) {
          if (cashCents <= 0) {
            break;
          }
          const ticker = TICKERS[instruction.tickerIndex];
          const priceValue = prices.get(ticker) ?? 0;
          const price = d(priceValue);
          if (!price.isFinite() || price.lte(0)) {
            continue;
          }

          const availableQuantityMicro = Math.floor(
            d(cashCents)
              .div(100)
              .div(price)
              .times(1_000_000)
              .toNumber(),
          );
          if (availableQuantityMicro <= 0) {
            continue;
          }

          const quantityMicro = Math.floor(
            availableQuantityMicro * Math.min(1, instruction.fraction),
          );
          if (quantityMicro <= 0) {
            continue;
          }

          const quantity = fromMicroShares(quantityMicro);
          const amountCents = toCents(quantity.times(price));
          if (amountCents <= 0 || amountCents > cashCents) {
            continue;
          }

          transactions.push({
            id: `buy-${date}-${ticker}-${quantityMicro}`,
            date,
            type: 'BUY',
            ticker,
            quantity: quantity.toNumber(),
            amount: fromCents(amountCents).toNumber(),
          });
          cashCents -= amountCents;
          holdingsMicro.set(
            ticker,
            (holdingsMicro.get(ticker) ?? 0) + quantityMicro,
          );
        }

        for (const instruction of plan.sellInstructions) {
          const ticker = TICKERS[instruction.tickerIndex];
          const ownedMicro = holdingsMicro.get(ticker) ?? 0;
          if (ownedMicro <= 0) {
            continue;
          }
          const priceValue = prices.get(ticker) ?? 0;
          const price = d(priceValue);
          if (!price.isFinite() || price.lte(0)) {
            continue;
          }

          const quantityMicro = Math.floor(ownedMicro * Math.min(1, instruction.fraction));
          if (quantityMicro <= 0) {
            continue;
          }

          const quantity = fromMicroShares(quantityMicro);
          const amountCents = toCents(quantity.times(price));
          if (amountCents <= 0) {
            continue;
          }

          transactions.push({
            id: `sell-${date}-${ticker}-${quantityMicro}`,
            date,
            type: 'SELL',
            ticker,
            quantity: -quantity.toNumber(),
            amount: fromCents(amountCents).toNumber(),
          });
          cashCents += amountCents;
          holdingsMicro.set(ticker, ownedMicro - quantityMicro);
        }

        const withdrawCents = Math.min(
          cashCents,
          Math.floor(cashCents * Math.min(1, plan.withdrawFraction)),
        );
        if (withdrawCents > 0) {
          cashCents -= withdrawCents;
          transactions.push({
            id: `withdraw-${date}-${withdrawCents}`,
            date,
            type: 'WITHDRAWAL',
            amount: fromCents(withdrawCents).toNumber(),
          });
        }
      }

      const sortedTransactions = sortTransactions(transactions);
      const states = computeDailyStates({
        transactions: sortedTransactions,
        pricesByDate,
        dates,
      });

      assert.ok(states.length === dates.length);

      const finalState = states.at(-1);
      assert.ok(finalState, 'final state missing');

      for (const ticker of TICKERS) {
        const expectedMicro = holdingsMicro.get(ticker) ?? 0;
        const actualQty = finalState.holdings.get(ticker) ?? 0;
        const actualMicro = toMicroShares(actualQty);
        assert.ok(
          Math.abs(actualMicro - expectedMicro) <= 2,
          `share imbalance for ${ticker}`,
        );
      }

      for (const state of states) {
        const priceMap = pricesByDate.get(state.date) ?? new Map();
        let expectedRiskValue = 0;
        for (const [ticker, qty] of state.holdings.entries()) {
          if (ticker === 'CASH') {
            continue;
          }
          const price = Number.parseFloat(priceMap.get(ticker) ?? '0');
          if (!Number.isFinite(price) || price <= 0) {
            continue;
          }
          expectedRiskValue += qty * price;
        }

        assert.ok(
          Math.abs(expectedRiskValue - state.riskValue) < 0.25,
          `risk value mismatch on ${state.date}`,
        );
        assert.ok(
          Math.abs(state.cash + expectedRiskValue - state.nav) < 0.25,
          `nav mismatch on ${state.date}`,
        );
        assert.ok(
          state.cash >= -0.01,
          `cash dipped negative on ${state.date}: ${state.cash}`,
        );
      }

      const spyPrices = new Map();
      for (const [date, priceMap] of pricesByDate.entries()) {
        spyPrices.set(date, priceMap.get('SPY') ?? 100);
      }

      const rateEntries = new Map();
      rateEntries.set(dates[0], 0);
      for (const entry of ratePlans) {
        const effectiveDate = dateKeyFromOffset(
          baseDate,
          Math.min(entry.offset, plans.length - 1),
        );
        const apy = Number.parseFloat(entry.apy.toFixed(6));
        rateEntries.set(effectiveDate, apy >= 0 ? apy : 0);
      }
      const rates = Array.from(rateEntries.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([effective_date, apy]) => ({ effective_date, apy }));

      const rows = computeDailyReturnRows({
        states,
        rates,
        spyPrices,
        transactions: sortedTransactions,
      });
      assert.equal(rows.length, states.length);

      const flowsByDate = externalFlowsByDate(sortedTransactions);
      for (let index = 0; index < rows.length; index += 1) {
        const state = states[index];
        const prevState = states[index - 1];
        const flow = flowsByDate.get(state.date) ?? d(0);
        const row = rows[index];

        if (!prevState) {
          if (flow.gt(0) && state.nav > 0) {
            const expected = d(state.nav).minus(flow).dividedBy(flow);
            assert.ok(
              expected.minus(d(row.r_port)).abs().lt(1e-6),
              'inception return drift',
            );
          } else {
            assert.ok(Math.abs(row.r_port) < 1e-8);
          }
          continue;
        }

        const expectedPort = computeReturnStep(prevState.nav, state.nav, flow);
        assert.ok(
          expectedPort.minus(d(row.r_port)).abs().lt(1e-6),
          'twr mismatch',
        );

        const expectedRisk = computeReturnStep(prevState.riskValue, state.riskValue, d(0));
        assert.ok(
          expectedRisk.minus(d(row.r_ex_cash)).abs().lt(1e-6),
          'ex cash return mismatch',
        );
      }

      const serializedStates = states.map((state) => ({
        ...state,
        holdings: Object.fromEntries(state.holdings.entries()),
      }));

      const rehydratedStates = serializedStates.map((state) => ({
        ...state,
        holdings: new Map(Object.entries(state.holdings)),
      }));

      const rowsReloaded = computeDailyReturnRows({
        states: rehydratedStates,
        rates,
        spyPrices,
        transactions: sortedTransactions,
      });

      assert.deepEqual(rowsReloaded, rows);
    }),
    { numRuns: 50 },
  );
});

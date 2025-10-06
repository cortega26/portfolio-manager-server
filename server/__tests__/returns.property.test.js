import assert from 'node:assert/strict';
import { test } from 'node:test';

import fc from 'fast-check';

import { computeDailyReturnRows, summarizeReturns } from '../finance/returns.js';
import { externalFlowsByDate } from '../finance/portfolio.js';
import { planArb, buildScenario, computeSpyReturns, scaleScenario } from './returns.property.shared.js';

test('summaries remain invariant when states are scaled', async () => {
  await fc.assert(
    fc.asyncProperty(planArb, fc.double({ min: 0.25, max: 5, noNaN: true }), async (plan, factor) => {
      const scenario = buildScenario(plan);
      const rows = computeDailyReturnRows(scenario);
      const scaled = scaleScenario(scenario, factor);
      const scaledRows = computeDailyReturnRows(scaled);
      assert.equal(rows.length, scaledRows.length);
      for (let i = 0; i < rows.length; i += 1) {
        const keys = ['r_port', 'r_ex_cash', 'r_bench_blended', 'r_spy_100', 'r_cash'];
        for (const key of keys) {
          const delta = Math.abs(rows[i][key] - scaledRows[i][key]);
          assert.ok(delta <= 2e-4, `Expected ${key} to remain invariant, delta=${delta}`);
        }
      }
    }),
  );
});

test('benchmarked returns align with blended weights under random flows', async () => {
  await fc.assert(
    fc.asyncProperty(planArb, async (plan) => {
      const scenario = buildScenario(plan);
      const rows = computeDailyReturnRows(scenario);
      const spyReturnMap = computeSpyReturns(scenario.spyPrices);
      const flows = externalFlowsByDate(scenario.transactions);
      for (let index = 1; index < rows.length; index += 1) {
        const prevState = scenario.states[index - 1];
        const flowDecimal = flows.get(rows[index].date);
        const flow =
          flowDecimal && typeof flowDecimal.toNumber === 'function'
            ? flowDecimal.toNumber()
            : Number.parseFloat(flowDecimal ?? 0) || 0;
        const navBasis = prevState.nav <= 0 ? 1 : prevState.nav;
        const weightCash = Math.min(1, Math.max(0, prevState.cash / navBasis));
        const rCash = rows[index].r_cash;
        const rSpy = spyReturnMap.get(rows[index].date) ?? 0;
        const expected = weightCash * rCash + (1 - weightCash) * rSpy;
        const delta = Math.abs(rows[index].r_bench_blended - expected);
        assert.ok(delta < 1.5e-5, `bench mismatch at ${rows[index].date}: ${delta}`);
        if (prevState.nav > 0) {
          const computed = (rows[index].r_port + 1) * prevState.nav + flow;
          const implied = scenario.states[index].nav;
          const tolerance = Math.max(5e-2, prevState.nav * 1e-6, 5e-5);
          assert.ok(Math.abs(computed - implied) < tolerance);
        }
      }
    }),
  );
});

test('summaries multiply daily returns without drift', async () => {
  await fc.assert(
    fc.asyncProperty(planArb, async (plan) => {
      const scenario = buildScenario(plan);
      const rows = computeDailyReturnRows(scenario);
      const summary = summarizeReturns(rows);
      const cumulative = rows.reduce(
        (acc, row) => ({
          r_port: acc.r_port * (1 + row.r_port),
          r_ex_cash: acc.r_ex_cash * (1 + row.r_ex_cash),
          r_bench_blended: acc.r_bench_blended * (1 + row.r_bench_blended),
          r_spy_100: acc.r_spy_100 * (1 + row.r_spy_100),
          r_cash: acc.r_cash * (1 + row.r_cash),
        }),
        {
          r_port: 1,
          r_ex_cash: 1,
          r_bench_blended: 1,
          r_spy_100: 1,
          r_cash: 1,
        },
      );
      assert.ok(Math.abs(summary.r_port - (cumulative.r_port - 1)) < 1e-6);
      assert.ok(Math.abs(summary.r_ex_cash - (cumulative.r_ex_cash - 1)) < 1e-6);
      assert.ok(
        Math.abs(summary.r_bench_blended - (cumulative.r_bench_blended - 1)) < 1e-6,
      );
      assert.ok(Math.abs(summary.r_spy_100 - (cumulative.r_spy_100 - 1)) < 1e-6);
      assert.ok(Math.abs(summary.r_cash - (cumulative.r_cash - 1)) < 1e-6);
    }),
  );
});

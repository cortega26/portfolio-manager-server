import assert from 'node:assert/strict';
import { test } from 'node:test';

import fc from 'fast-check';

import * as returns from '../finance/returns.js';
import { buildScenario, computeSpyReturns, planArb } from './returns.property.shared.js';

const ASSERT_OPTIONS = { verbose: 0, numRuns: 40 };

async function expectPropertyFailure(propertyFactory) {
  await assert.rejects(async () => fc.assert(await propertyFactory(), ASSERT_OPTIONS));
}

test('anti-test: blended benchmark drops cash weighting', async () => {
  await expectPropertyFailure(async () =>
    fc.asyncProperty(planArb, async (plan) => {
      const scenario = buildScenario(plan);
      const rows = returns
        .computeDailyReturnRows(scenario)
        .map((row) => ({ ...row, r_bench_blended: row.r_spy_100 }));
      const spyReturnMap = computeSpyReturns(scenario.spyPrices);
      for (let index = 1; index < rows.length; index += 1) {
        const prevState = scenario.states[index - 1];
        const navBasis = prevState.nav <= 0 ? 1 : prevState.nav;
        const weightCash = Math.min(1, Math.max(0, prevState.cash / navBasis));
        const rCash = rows[index].r_cash;
        const rSpy = spyReturnMap.get(rows[index].date) ?? 0;
        const expected = weightCash * rCash + (1 - weightCash) * rSpy;
        const delta = Math.abs(rows[index].r_bench_blended - expected);
        assert.ok(delta < 1.5e-5, `bench mismatch at ${rows[index].date}: ${delta}`);
      }
    }),
  );
});

test('anti-test: summary drift is detected when compounding is skipped', async () => {
  await expectPropertyFailure(async () =>
    fc.asyncProperty(planArb, async (plan) => {
      const scenario = buildScenario(plan);
      const rows = returns.computeDailyReturnRows(scenario);
      const summary = (() => {
        const baseline = returns.summarizeReturns(rows);
        return { ...baseline, r_port: baseline.r_port + 0.015 };
      })();
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
      assert.ok(Math.abs(summary.r_bench_blended - (cumulative.r_bench_blended - 1)) < 1e-6);
      assert.ok(Math.abs(summary.r_spy_100 - (cumulative.r_spy_100 - 1)) < 1e-6);
      assert.ok(Math.abs(summary.r_cash - (cumulative.r_cash - 1)) < 1e-6);
    }),
  );
});

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildRoiSeriesPayload } from '../services/performanceHistory.js';

test('buildRoiSeriesPayload preserves missing imported benchmarks as null data instead of fake zero lines', () => {
  const payload = buildRoiSeriesPayload({
    roiRows: [
      {
        date: '2024-01-01',
        roi_portfolio_pct: 0,
        roi_sp500_pct: null,
        roi_ndx_pct: null,
      },
      {
        date: '2024-01-02',
        roi_portfolio_pct: 1.5,
        roi_sp500_pct: null,
        roi_ndx_pct: null,
      },
    ],
    returnRows: [],
  });

  assert.deepEqual(payload.series.spy, []);
  assert.deepEqual(payload.series.bench, []);
  assert.equal(payload.benchmarkHealth.spy.available, false);
  assert.equal(payload.benchmarkHealth.blended.available, false);
  assert.deepEqual(
    payload.merged.map((row) => ({
      date: row.date,
      spy: row.spy ?? null,
      blended: row.blended ?? null,
    })),
    [
      { date: '2024-01-01', spy: null, blended: null },
      { date: '2024-01-02', spy: null, blended: null },
    ]
  );
});

test('buildRoiSeriesPayload converts benchmark returns into flow-matched ROI series', () => {
  const payload = buildRoiSeriesPayload({
    roiRows: [
      {
        date: '2024-01-01',
        portfolio_nav: 100,
        net_contributions: 100,
        roi_portfolio_pct: 0,
      },
      {
        date: '2024-01-02',
        portfolio_nav: 210,
        net_contributions: 200,
        roi_portfolio_pct: 5,
      },
    ],
    returnRows: [
      {
        date: '2024-01-01',
        r_port: 0,
        r_ex_cash: 0,
        r_bench_blended: 0,
        r_spy_100: 0,
        r_qqq_100: 0,
        r_cash: 0,
      },
      {
        date: '2024-01-02',
        r_port: 0.1,
        r_ex_cash: 0.1,
        r_bench_blended: 0.1,
        r_spy_100: 0.1,
        r_qqq_100: 0.1,
        r_cash: 0,
      },
    ],
  });

  assert.deepEqual(payload.series.portfolio, [
    { date: '2024-01-01', value: 0 },
    { date: '2024-01-02', value: 5 },
  ]);
  assert.deepEqual(payload.series.portfolioTwr, [
    { date: '2024-01-01', value: 0 },
    { date: '2024-01-02', value: 10 },
  ]);
  assert.deepEqual(payload.series.spy, [
    { date: '2024-01-01', value: 0 },
    { date: '2024-01-02', value: 10 },
  ]);
  assert.deepEqual(payload.series.qqq, [
    { date: '2024-01-01', value: 0 },
    { date: '2024-01-02', value: 10 },
  ]);
  assert.deepEqual(payload.series.bench, [
    { date: '2024-01-01', value: 0 },
    { date: '2024-01-02', value: 10 },
  ]);
});

test('buildRoiSeriesPayload converts portfolio returns into a flow-matched ROI series that starts at zero', () => {
  const payload = buildRoiSeriesPayload({
    roiRows: [
      {
        date: '2023-11-27',
        portfolio_nav: 0.98,
        net_contributions: 1,
        roi_portfolio_pct: -2,
      },
      {
        date: '2023-11-28',
        portfolio_nav: 1.02,
        net_contributions: 1,
        roi_portfolio_pct: 2,
      },
    ],
    returnRows: [
      {
        date: '2023-11-27',
        r_port: 0,
        r_ex_cash: 0,
        r_bench_blended: 0,
        r_spy_100: 0,
        r_qqq_100: 0,
        r_cash: 0,
      },
      {
        date: '2023-11-28',
        r_port: 0.0408163265,
        r_ex_cash: 0.0408163265,
        r_bench_blended: 0.01,
        r_spy_100: 0.01,
        r_qqq_100: 0.02,
        r_cash: 0,
      },
    ],
  });

  assert.deepEqual(payload.series.portfolio, [
    { date: '2023-11-27', value: 0 },
    { date: '2023-11-28', value: 4.081633 },
  ]);
  assert.equal(payload.merged[0]?.portfolio ?? null, 0);
});

test('buildRoiSeriesPayload rebases imported portfolio ROI to zero when returns are unavailable', () => {
  const payload = buildRoiSeriesPayload({
    roiRows: [
      {
        date: '2023-11-27',
        roi_portfolio_pct: -2,
        roi_sp500_pct: null,
        roi_ndx_pct: null,
      },
      {
        date: '2023-11-28',
        roi_portfolio_pct: 2,
        roi_sp500_pct: null,
        roi_ndx_pct: null,
      },
    ],
    returnRows: [],
  });

  assert.deepEqual(payload.series.portfolio, [
    { date: '2023-11-27', value: 0 },
    { date: '2023-11-28', value: 4.081633 },
  ]);
  assert.equal(payload.merged[0]?.portfolio ?? null, 0);
});

test('buildRoiSeriesPayload keeps canonical ROI precision near display rounding thresholds', () => {
  const payload = buildRoiSeriesPayload({
    roiRows: [
      {
        date: '2024-01-01',
        portfolio_nav: 100,
        net_contributions: 100,
        roi_portfolio_pct: 0,
      },
      {
        date: '2024-01-02',
        portfolio_nav: 177.94444,
        net_contributions: 100,
        roi_portfolio_pct: 77.94444,
      },
    ],
    returnRows: [
      {
        date: '2024-01-01',
        r_port: 0,
        r_ex_cash: 0,
        r_bench_blended: 0,
        r_spy_100: 0,
        r_qqq_100: 0,
        r_cash: 0,
      },
      {
        date: '2024-01-02',
        r_port: 0.7794444,
        r_ex_cash: 0,
        r_bench_blended: 0,
        r_spy_100: 0,
        r_qqq_100: 0,
        r_cash: 0,
      },
    ],
  });

  assert.equal(payload.series.portfolio[1]?.value ?? null, 77.94444);
  assert.equal(payload.merged[1]?.portfolio ?? null, 77.94444);
});

import { buildPriceFetchWindows } from '../services/performanceHistory.js';

test('buildPriceFetchWindows: returns single window for empty rows', () => {
  const windows = buildPriceFetchWindows([], '2024-01-01', '2024-01-10');
  assert.deepStrictEqual(windows, [{ from: '2024-01-01', to: '2024-01-10' }]);
});

test('buildPriceFetchWindows: returns empty for fully covered range', () => {
  const rows = [
    { date: '2024-01-01' },
    { date: '2024-01-02' },
    { date: '2024-01-03' },
    { date: '2024-01-04' },
    { date: '2024-01-05' },
  ];
  const windows = buildPriceFetchWindows(rows, '2024-01-01', '2024-01-05');
  assert.deepStrictEqual(windows, []);
});

test('buildPriceFetchWindows: detects prefix gap', () => {
  const rows = [{ date: '2024-01-05' }, { date: '2024-01-06' }];
  const windows = buildPriceFetchWindows(rows, '2024-01-01', '2024-01-06');
  assert.deepStrictEqual(windows, [{ from: '2024-01-01', to: '2024-01-04' }]);
});

test('buildPriceFetchWindows: detects suffix gap', () => {
  const rows = [{ date: '2024-01-01' }, { date: '2024-01-02' }];
  const windows = buildPriceFetchWindows(rows, '2024-01-01', '2024-01-06');
  assert.deepStrictEqual(windows, [{ from: '2024-01-03', to: '2024-01-06' }]);
});

test('buildPriceFetchWindows: detects mid-range gap', () => {
  const rows = [
    { date: '2024-01-01' },
    { date: '2024-01-02' },
    // gap: Jan 3–Jan 8
    { date: '2024-01-09' },
    { date: '2024-01-10' },
  ];
  const windows = buildPriceFetchWindows(rows, '2024-01-01', '2024-01-10');
  assert.deepStrictEqual(windows, [{ from: '2024-01-03', to: '2024-01-08' }]);
});

test('buildPriceFetchWindows: detects multiple mid-range gaps', () => {
  const rows = [
    { date: '2024-01-01' },
    // gap 1: Jan 2–3
    { date: '2024-01-04' },
    // gap 2: Jan 5–7
    { date: '2024-01-08' },
  ];
  const windows = buildPriceFetchWindows(rows, '2024-01-01', '2024-01-08');
  assert.deepStrictEqual(windows, [
    { from: '2024-01-02', to: '2024-01-03' },
    { from: '2024-01-05', to: '2024-01-07' },
  ]);
});

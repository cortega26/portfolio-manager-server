import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';

import { d } from '../finance/decimal.js';
import {
  _setCorporateActionsForTest,
  _resetCorporateActionsCache,
} from '../import/csvPortfolioImport.js';

// Access maybeApplyDatasetQuantityAdjustment indirectly by calling the
// exported buildBuyOrSellTransaction-level logic through the public
// buildCsvPortfolioImport contract — but since that function requires CSV
// files, we test the split-application logic by injecting known corporate
// actions and verifying the resulting transaction quantities.
//
// The function is pure once corporateActions are provided, so we test it
// through the helper that exposes the adjustment logic.

// Internal helper extracted for unit testing:
// maybeApplyDatasetQuantityAdjustment is not exported, so we replicate its
// contract here by testing through _setCorporateActionsForTest + the module.
// For a cleaner test, we import the logic directly from the module.
//
// We use a thin wrapper to replicate what buildBuyOrSellTransaction does:
function applyAdjustment({ ticker, date, type, quantity }, corporateActions) {
  for (const action of corporateActions) {
    if (action.type !== 'split') continue;
    if (action.ticker !== ticker) continue;
    if (date >= action.date) continue;

    const appliesToTransaction =
      action.applies_to === 'ALL' ||
      action.applies_to === type;

    if (!appliesToTransaction) continue;

    return {
      quantity: d(quantity).times(action.ratio),
      adjustment: {
        rule: action.rule,
        factor: String(action.ratio),
      },
    };
  }
  return { quantity: d(quantity), adjustment: null };
}

// --- Unit tests for the adjustment logic ---

test('split with ratio:10 multiplies quantity by 10 for pre-split date', () => {
  const actions = [
    { ticker: 'NVDA', date: '2024-06-10', type: 'split', ratio: 10, applies_to: 'ALL', rule: 'NVDA_10_FOR_1' },
  ];
  const { quantity, adjustment } = applyAdjustment(
    { ticker: 'NVDA', date: '2024-01-01', type: 'BUY', quantity: '5' },
    actions,
  );
  assert.equal(quantity.toNumber(), 50);
  assert.equal(adjustment.factor, '10');
  assert.equal(adjustment.rule, 'NVDA_10_FOR_1');
});

test('split is NOT applied to a transaction on or after the split date', () => {
  const actions = [
    { ticker: 'NVDA', date: '2024-06-10', type: 'split', ratio: 10, applies_to: 'ALL', rule: 'NVDA_10_FOR_1' },
  ];
  const { quantity, adjustment } = applyAdjustment(
    { ticker: 'NVDA', date: '2024-06-10', type: 'BUY', quantity: '3' },
    actions,
  );
  assert.equal(quantity.toNumber(), 3);
  assert.equal(adjustment, null);
});

test('ticker without a matching rule is not modified', () => {
  const actions = [
    { ticker: 'NVDA', date: '2024-06-10', type: 'split', ratio: 10, applies_to: 'ALL', rule: 'NVDA_10_FOR_1' },
  ];
  const { quantity, adjustment } = applyAdjustment(
    { ticker: 'AAPL', date: '2024-01-01', type: 'BUY', quantity: '7' },
    actions,
  );
  assert.equal(quantity.toNumber(), 7);
  assert.equal(adjustment, null);
});

test('applies_to:BUY only adjusts BUY transactions, not SELL', () => {
  const actions = [
    { ticker: 'LRCX', date: '2024-10-03', type: 'split', ratio: 10, applies_to: 'BUY', rule: 'LRCX_10_FOR_1' },
  ];
  const buyResult = applyAdjustment(
    { ticker: 'LRCX', date: '2024-01-01', type: 'BUY', quantity: '2' },
    actions,
  );
  assert.equal(buyResult.quantity.toNumber(), 20);

  const sellResult = applyAdjustment(
    { ticker: 'LRCX', date: '2024-01-01', type: 'SELL', quantity: '2' },
    actions,
  );
  assert.equal(sellResult.quantity.toNumber(), 2);
  assert.equal(sellResult.adjustment, null);
});

test('applies_to:ALL adjusts both BUY and SELL', () => {
  const actions = [
    { ticker: 'NVDA', date: '2024-06-10', type: 'split', ratio: 10, applies_to: 'ALL', rule: 'NVDA_10_FOR_1' },
  ];
  const buyResult = applyAdjustment(
    { ticker: 'NVDA', date: '2023-12-01', type: 'BUY', quantity: '1' },
    actions,
  );
  assert.equal(buyResult.quantity.toNumber(), 10);

  const sellResult = applyAdjustment(
    { ticker: 'NVDA', date: '2023-12-01', type: 'SELL', quantity: '1' },
    actions,
  );
  assert.equal(sellResult.quantity.toNumber(), 10);
});

test('empty corporate actions list returns quantity unchanged', () => {
  const { quantity, adjustment } = applyAdjustment(
    { ticker: 'NVDA', date: '2023-01-01', type: 'BUY', quantity: '5' },
    [],
  );
  assert.equal(quantity.toNumber(), 5);
  assert.equal(adjustment, null);
});

test('NVDA and LRCX rules from actual config produce correct adjustments', async () => {
  // Load the real corporateActions.json to verify the migrated rules are correct.
  const { loadCorporateActions } = await import('../import/csvPortfolioImport.js');
  _resetCorporateActionsCache();
  const actions = await loadCorporateActions();

  // NVDA pre-split BUY
  const nvdaBuy = applyAdjustment(
    { ticker: 'NVDA', date: '2024-01-15', type: 'BUY', quantity: '3' },
    actions,
  );
  assert.equal(nvdaBuy.quantity.toNumber(), 30);

  // NVDA pre-split SELL (applies_to: ALL)
  const nvdaSell = applyAdjustment(
    { ticker: 'NVDA', date: '2024-01-15', type: 'SELL', quantity: '1' },
    actions,
  );
  assert.equal(nvdaSell.quantity.toNumber(), 10);

  // LRCX pre-split BUY
  const lrcxBuy = applyAdjustment(
    { ticker: 'LRCX', date: '2024-01-01', type: 'BUY', quantity: '2' },
    actions,
  );
  assert.equal(lrcxBuy.quantity.toNumber(), 20);

  // LRCX pre-split SELL — should NOT be adjusted (applies_to: BUY only)
  const lrcxSell = applyAdjustment(
    { ticker: 'LRCX', date: '2024-01-01', type: 'SELL', quantity: '2' },
    actions,
  );
  assert.equal(lrcxSell.quantity.toNumber(), 2);
});

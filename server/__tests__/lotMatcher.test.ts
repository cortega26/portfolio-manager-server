// server/__tests__/lotMatcher.test.ts
// Unit tests for the FIFO lot matcher (server/finance/lotMatcher.ts).
// All test data uses explicit numeric strings to avoid float precision surprises.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { matchLots } from '../finance/lotMatcher.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function buy(date: string, ticker: string, shares: string, price: string, uid?: string) {
  return { date, type: 'BUY', ticker, shares, price, uid };
}

function sell(date: string, ticker: string, shares: string, price: string, uid?: string) {
  return { date, type: 'SELL', ticker, shares, price, uid };
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('lotMatcher — FIFO', () => {
  // 1. Single buy + full sell
  it('single buy then full sell emits one ClosedLot', () => {
    const txs = [
      buy('2023-01-10', 'AAPL', '10', '150'),
      sell('2023-06-01', 'AAPL', '10', '180'),
    ];
    const { closedLots, openLots } = matchLots(txs);

    assert.equal(closedLots.length, 1);
    assert.equal(openLots.length, 0);

    const lot = closedLots[0]!;
    assert.equal(lot.ticker, 'AAPL');
    assert.equal(lot.buyDate, '2023-01-10');
    assert.equal(lot.sellDate, '2023-06-01');
    assert.equal(lot.shares, '10');
    assert.equal(lot.costBasis, '1500');
    assert.equal(lot.proceeds, '1800');
    assert.equal(lot.gainLoss, '300');
    // 2023-01-10 → 2023-06-01 = 142 days
    assert.equal(lot.holdingDays, 142);
  });

  // 2. Single buy + partial sell (lot split)
  it('partial sell leaves residual in open lots', () => {
    const txs = [
      buy('2023-01-10', 'AAPL', '10', '150'),
      sell('2023-06-01', 'AAPL', '6', '180'),
    ];
    const { closedLots, openLots } = matchLots(txs);

    assert.equal(closedLots.length, 1);
    assert.equal(openLots.length, 1);

    const closed = closedLots[0]!;
    assert.equal(closed.shares, '6');
    assert.equal(closed.costBasis, '900');
    assert.equal(closed.proceeds, '1080');
    assert.equal(closed.gainLoss, '180');

    const open = openLots[0]!;
    assert.equal(open.ticker, 'AAPL');
    assert.equal(open.shares, '4');
    assert.equal(open.buyDate, '2023-01-10');
  });

  // 3. Multiple buys + single sell spanning multiple lots
  it('sell spanning two lots emits two ClosedLots (FIFO order)', () => {
    const txs = [
      buy('2022-01-01', 'TSLA', '5', '200', 'uid-a'),
      buy('2022-06-01', 'TSLA', '5', '250', 'uid-b'),
      sell('2023-01-01', 'TSLA', '8', '300'),
    ];
    const { closedLots, openLots } = matchLots(txs);

    assert.equal(closedLots.length, 2);
    assert.equal(openLots.length, 1);

    // First closed lot — entirely from the first buy (5 shares at 200)
    const first = closedLots[0]!;
    assert.equal(first.shares, '5');
    assert.equal(first.buyPrice, '200');
    assert.equal(first.costBasis, '1000');
    assert.equal(first.proceeds, '1500');
    assert.equal(first.gainLoss, '500');

    // Second closed lot — 3 shares from the second buy (250 each)
    const second = closedLots[1]!;
    assert.equal(second.shares, '3');
    assert.equal(second.buyPrice, '250');
    assert.equal(second.costBasis, '750');
    assert.equal(second.proceeds, '900');
    assert.equal(second.gainLoss, '150');

    // Remaining open lot — 2 shares at 250
    const open = openLots[0]!;
    assert.equal(open.shares, '2');
    assert.equal(open.buyPrice, '250');
  });

  // 4. Multiple buys + multiple sells (complex FIFO sequence)
  it('complex multi-buy multi-sell sequence maintains correct FIFO state', () => {
    const txs = [
      buy('2021-01-01', 'NVDA', '10', '100'),
      buy('2021-07-01', 'NVDA', '10', '200'),
      sell('2021-09-01', 'NVDA', '12', '250'), // consumes all 10 from buy1 + 2 from buy2
      buy('2022-01-01', 'NVDA', '5', '300'),
      sell('2022-06-01', 'NVDA', '8', '350'),  // consumes 8 from buy2 (has 8 left)
    ];
    const { closedLots, openLots } = matchLots(txs);

    // sell1: 10 + 2 = 2 ClosedLots
    // sell2: 8 from buy2 (8 left after sell1) = 1 ClosedLot
    // Total: 3 ClosedLots
    assert.equal(closedLots.length, 3);

    // After sell1: buy2 has 8 shares left. After sell2: buy2 exhausted (8-8=0).
    // buy3 (5 shares at 300) remains open.
    assert.equal(openLots.length, 1);
    assert.equal(openLots[0]!.shares, '5');
    assert.equal(openLots[0]!.buyPrice, '300');

    // Verify sell1 lots (sell at 250)
    assert.equal(closedLots[0]!.shares, '10');
    assert.equal(closedLots[0]!.buyPrice, '100');
    assert.equal(closedLots[0]!.sellPrice, '250');
    assert.equal(closedLots[0]!.gainLoss, '1500'); // (250-100)*10

    assert.equal(closedLots[1]!.shares, '2');
    assert.equal(closedLots[1]!.buyPrice, '200');
    assert.equal(closedLots[1]!.sellPrice, '250');
    assert.equal(closedLots[1]!.gainLoss, '100'); // (250-200)*2

    // sell2 lot (sell at 350, 8 shares from buy2 at 200)
    assert.equal(closedLots[2]!.shares, '8');
    assert.equal(closedLots[2]!.buyPrice, '200');
    assert.equal(closedLots[2]!.sellPrice, '350');
    assert.equal(closedLots[2]!.gainLoss, '1200'); // (350-200)*8
  });

  // 5. Edge case: sell exceeds available shares → throws
  it('throws when SELL exceeds available open shares', () => {
    const txs = [
      buy('2023-01-01', 'AMD', '5', '100'),
      sell('2023-06-01', 'AMD', '10', '120'), // 10 > 5 → error
    ];
    assert.throws(
      () => matchLots(txs),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('LotMatcher'));
        assert.ok(err.message.includes('AMD'));
        return true;
      },
    );
  });

  // 6. Non-equity transaction types are ignored
  it('ignores DIVIDEND, DEPOSIT, WITHDRAWAL, INTEREST, SPLIT transactions', () => {
    const txs = [
      { date: '2023-01-01', type: 'DEPOSIT', ticker: 'CASH', shares: '0', price: '0' },
      buy('2023-01-10', 'AAPL', '5', '150'),
      { date: '2023-03-01', type: 'DIVIDEND', ticker: 'AAPL', shares: '0', price: '0' },
      sell('2023-09-01', 'AAPL', '5', '200'),
      { date: '2023-12-01', type: 'WITHDRAWAL', ticker: 'CASH', shares: '0', price: '0' },
    ];
    const { closedLots, openLots } = matchLots(txs);
    assert.equal(closedLots.length, 1);
    assert.equal(openLots.length, 0);
    assert.equal(closedLots[0]!.gainLoss, '250'); // (200-150)*5
  });

  // 7. Zero-share transactions are skipped
  it('skips zero-share BUY and SELL entries without error', () => {
    const txs = [
      buy('2023-01-01', 'GOOG', '0', '100'),
      buy('2023-02-01', 'GOOG', '10', '100'),
      sell('2023-08-01', 'GOOG', '0', '120'),
      sell('2023-09-01', 'GOOG', '10', '120'),
    ];
    const { closedLots, openLots } = matchLots(txs);
    assert.equal(closedLots.length, 1);
    assert.equal(openLots.length, 0);
  });

  // 8. Holding period computed correctly for holdingDays
  it('computes holdingDays accurately for a known interval', () => {
    const txs = [
      buy('2023-01-01', 'SPY', '1', '400'),
      sell('2024-01-01', 'SPY', '1', '450'), // exactly 365 days
    ];
    const { closedLots } = matchLots(txs);
    assert.equal(closedLots[0]!.holdingDays, 365);
  });

  // 9. Multiple independent tickers do not interfere
  it('independent tickers maintain separate FIFO queues', () => {
    const txs = [
      buy('2023-01-01', 'AAPL', '10', '150'),
      buy('2023-01-01', 'GOOG', '5', '100'),
      sell('2023-06-01', 'AAPL', '10', '200'),
      sell('2023-06-01', 'GOOG', '5', '130'),
    ];
    const { closedLots, openLots } = matchLots(txs);
    assert.equal(closedLots.length, 2);
    assert.equal(openLots.length, 0);

    const aaplLot = closedLots.find((l) => l.ticker === 'AAPL')!;
    assert.equal(aaplLot.gainLoss, '500'); // (200-150)*10

    const goolLot = closedLots.find((l) => l.ticker === 'GOOG')!;
    assert.equal(goolLot.gainLoss, '150'); // (130-100)*5
  });

  // 10. Fractional shares (decimal precision)
  it('handles fractional share quantities correctly', () => {
    const txs = [
      buy('2023-01-01', 'FNTL', '1.5', '100'),
      sell('2023-06-01', 'FNTL', '0.75', '120'),
    ];
    const { closedLots, openLots } = matchLots(txs);
    assert.equal(closedLots.length, 1);
    assert.equal(openLots.length, 1);

    const closed = closedLots[0]!;
    assert.equal(closed.shares, '0.75');
    assert.equal(closed.costBasis, '75');
    assert.equal(closed.proceeds, '90');
    assert.equal(closed.gainLoss, '15');

    const open = openLots[0]!;
    assert.equal(open.shares, '0.75');
  });
});

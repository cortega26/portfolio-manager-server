import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { validateAndNormalizePortfolioPayload } from '../utils/portfolioSchema.js';

describe('portfolio payload validation', () => {
  it('normalizes tickers, transaction types, and settings', () => {
    const payload = {
      transactions: [
        {
          id: 'tx-import-1',
          uid: 'tx-import-1',
          createdAt: '1712016000000',
          seq: '4',
          date: '2024-01-02',
          ticker: 'spy ',
          type: 'buy',
          amount: '-1000',
          price: '100',
          shares: '10',
          currency: 'usd',
          metadata: {
            system: {
              import: {
                source: 'csv-bootstrap',
                original: {
                  note: 'nested metadata should survive client validation',
                },
              },
            },
          },
        },
        {
          date: '2024-01-03',
          type: 'withdraw',
          amount: '250',
          note: 'cash out',
        },
      ],
      signals: {
        spy: { pct: '5' },
      },
      settings: {
        autoClip: true,
      },
    };

    const result = validateAndNormalizePortfolioPayload(payload);

    assert.equal(result.transactions.length, 2);
    assert.equal(result.transactions[0].ticker, 'SPY');
    assert.equal(result.transactions[0].type, 'BUY');
    assert.equal(result.transactions[0].amount, -1000);
    assert.equal(result.transactions[0].price, 100);
    assert.equal(result.transactions[0].quantity, 10);
    assert.equal(result.transactions[0].createdAt, 1712016000000);
    assert.equal(result.transactions[0].seq, 4);
    assert.equal(result.transactions[0].currency, 'USD');
    assert.deepEqual(result.transactions[0].metadata, {
      system: {
        import: {
          source: 'csv-bootstrap',
          original: {
            note: 'nested metadata should survive client validation',
          },
        },
      },
    });
    assert.equal(result.transactions[1].type, 'WITHDRAWAL');
    assert.equal(result.transactions[1].ticker, undefined);
    assert.deepEqual(result.signals, { SPY: { pct: 5 } });
    assert.deepEqual(result.settings, {
      notifications: {
        email: false,
        push: true,
        signalTransitions: true,
      },
      alerts: {
        rebalance: true,
        drawdownThreshold: 15,
        marketStatus: true,
        roiFallback: true,
      },
      privacy: {
        hideBalances: false,
      },
      display: {
        currency: 'USD',
        refreshInterval: 15,
        compactTables: false,
      },
      autoClip: true,
    });
    assert.deepEqual(result.cash, { currency: 'USD', apyTimeline: [] });
  });

  it('throws with helpful error details when validation fails', () => {
    const invalidPayload = {
      transactions: [
        {
          date: '2024/01/02',
          type: 'BUY',
          amount: 'not-a-number',
        },
      ],
    };

    assert.throws(
      () => validateAndNormalizePortfolioPayload(invalidPayload),
      (error) => {
        assert.equal(error.name, 'PortfolioValidationError');
        assert.ok(Array.isArray(error.issues));
        assert.ok(error.message.includes('Portfolio payload validation failed'));
        return true;
      }
    );
  });
});

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CSV_IMPORT_EXPECTED_RECONCILIATION,
  buildCsvPortfolioImport,
} from '../../server/import/csvPortfolioImport.js';
import { buildHoldings, filterOpenHoldings } from '../utils/holdings.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('frontend holdings reconciliation', () => {
  it('reproduces the exact open positions from the CSV bootstrap snapshot', async () => {
    const result = await buildCsvPortfolioImport({ sourceDir: projectRoot });
    const holdings = buildHoldings(result.snapshot.transactions);
    const openHoldings = filterOpenHoldings(holdings);

    assert.equal(openHoldings.length, 5);
    assert.deepEqual(
      Object.fromEntries(openHoldings.map((holding) => [holding.ticker, holding.shares])),
      CSV_IMPORT_EXPECTED_RECONCILIATION.holdings
    );
  });

  it('matches the corrected NVDA split reconciliation from the CSV source of truth', async () => {
    const result = await buildCsvPortfolioImport({ sourceDir: projectRoot });
    const holdings = filterOpenHoldings(buildHoldings(result.snapshot.transactions));
    const nvda = holdings.find((holding) => holding.ticker === 'NVDA');

    assert.ok(nvda);
    assert.equal(nvda.shares, '0.815097910');
    assert.equal(nvda.cost, 147.90260276740557);
    assert.equal(nvda.realised, 62.89260276740556);
  });
});

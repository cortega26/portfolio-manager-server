import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { sanitizeCsvCell } from '../../src/utils/csv.js';

describe('sanitizeCsvCell', () => {
  it('returns empty string for nullish values', () => {
    assert.equal(sanitizeCsvCell(null), '');
    assert.equal(sanitizeCsvCell(undefined), '');
  });

  it('prefixes risky leading characters with a quote', () => {
    assert.equal(sanitizeCsvCell('=SUM(A1:A2)'), "'=SUM(A1:A2)");
    assert.equal(sanitizeCsvCell('+1+2'), "'+1+2");
    assert.equal(sanitizeCsvCell('-2^3'), "'-2^3");
    assert.equal(sanitizeCsvCell('@CMD'), "'@CMD");
  });

  it('returns unchanged strings without risky prefixes', () => {
    assert.equal(sanitizeCsvCell('portfolio'), 'portfolio');
    assert.equal(sanitizeCsvCell('123'), '123');
  });
});


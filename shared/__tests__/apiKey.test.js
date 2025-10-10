import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  API_KEY_REQUIREMENTS,
  API_KEY_SPECIAL_CHARACTERS,
  evaluateApiKeyRequirements,
  isApiKeyStrong,
} from '../apiKey.js';

test('strong keys satisfy every requirement', () => {
  const key = 'MyPortfolio2024!Secure';
  const checks = evaluateApiKeyRequirements(key);
  assert.equal(checks.length, API_KEY_REQUIREMENTS.length);
  for (const check of checks) {
    assert.equal(check.met, true, `${check.requirement} should be met`);
    assert.equal(typeof check.translationKey, 'string');
  }
  assert.equal(isApiKeyStrong(key), true);
});

test('weak keys fail multiple requirements', () => {
  const key = 'weakkey';
  const checks = evaluateApiKeyRequirements(key);
  assert.equal(checks.length, API_KEY_REQUIREMENTS.length);
  const unmet = checks.filter((check) => !check.met);
  assert.equal(unmet.length >= 3, true);
  assert.equal(isApiKeyStrong(key), false);
});

test('rotation keys must include allowed special characters', () => {
  const key = 'RotatingKey22$';
  const checks = evaluateApiKeyRequirements(key);
  const specialsCheck = checks.find(
    (check) => check.translationKey === 'portfolioControls.requirements.special',
  );
  assert.equal(specialsCheck?.met, true);
  assert.equal(
    specialsCheck?.translationValues?.characters,
    API_KEY_SPECIAL_CHARACTERS,
  );
  assert.equal(isApiKeyStrong(key), true);
});

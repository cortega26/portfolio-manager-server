// @ts-nocheck
export const API_KEY_MIN_LENGTH = 12;
export const API_KEY_SPECIAL_CHARACTERS = '!@#$%^&*';

const escapedSpecials = API_KEY_SPECIAL_CHARACTERS.replace(
  /[-/\\^$*+?.()|[\]{}]/g,
  '\\$&',
);

const SPECIAL_CHAR_REGEX = new RegExp(`[${escapedSpecials}]`, 'u');

const API_KEY_REQUIREMENT_DEFINITIONS = [
  {
    id: 'length',
    translationKey: 'portfolioControls.requirements.length',
    fallbackMessage: `At least ${API_KEY_MIN_LENGTH} characters`,
    translationValues: { minLength: API_KEY_MIN_LENGTH },
    test: (input) => input.length >= API_KEY_MIN_LENGTH,
  },
  {
    id: 'uppercase',
    translationKey: 'portfolioControls.requirements.uppercase',
    fallbackMessage: 'At least 1 uppercase letter',
    translationValues: undefined,
    test: (input) => /[A-Z]/u.test(input),
  },
  {
    id: 'lowercase',
    translationKey: 'portfolioControls.requirements.lowercase',
    fallbackMessage: 'At least 1 lowercase letter',
    translationValues: undefined,
    test: (input) => /[a-z]/u.test(input),
  },
  {
    id: 'number',
    translationKey: 'portfolioControls.requirements.number',
    fallbackMessage: 'At least 1 number',
    translationValues: undefined,
    test: (input) => /\d/u.test(input),
  },
  {
    id: 'special',
    translationKey: 'portfolioControls.requirements.special',
    fallbackMessage: `At least 1 special character (${API_KEY_SPECIAL_CHARACTERS})`,
    translationValues: { characters: API_KEY_SPECIAL_CHARACTERS },
    test: (input) => SPECIAL_CHAR_REGEX.test(input),
  },
];

export const API_KEY_REQUIREMENTS = API_KEY_REQUIREMENT_DEFINITIONS.map(
  (definition) => definition.fallbackMessage,
);

export const API_KEY_REGEX = new RegExp(
  `^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[${escapedSpecials}])[^\\s]{${API_KEY_MIN_LENGTH},}$`,
  'u',
);

function normalize(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function evaluateApiKeyRequirements(value) {
  const input = normalize(value);
  return API_KEY_REQUIREMENT_DEFINITIONS.map((definition) => ({
    id: definition.id,
    requirement: definition.fallbackMessage,
    translationKey: definition.translationKey,
    translationValues: definition.translationValues,
    met: definition.test(input),
  }));
}

export function isApiKeyStrong(value) {
  if (typeof value !== 'string') {
    return false;
  }
  return API_KEY_REGEX.test(value.trim());
}

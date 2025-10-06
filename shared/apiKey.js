export const API_KEY_MIN_LENGTH = 12;
export const API_KEY_SPECIAL_CHARACTERS = '!@#$%^&*';

export const API_KEY_REQUIREMENTS = [
  'At least 12 characters',
  'At least 1 uppercase letter',
  'At least 1 lowercase letter',
  'At least 1 number',
  'At least 1 special character (!@#$%^&*)',
];

const escapedSpecials = API_KEY_SPECIAL_CHARACTERS.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');

const SPECIAL_CHAR_REGEX = new RegExp(`[${escapedSpecials}]`, 'u');

export const API_KEY_REGEX = new RegExp(
  `^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[${escapedSpecials}])[^\\s]{${API_KEY_MIN_LENGTH},}$`,
  'u',
);

function normalize(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function evaluateApiKeyRequirements(value) {
  const input = normalize(value);
  const checks = [
    {
      requirement: API_KEY_REQUIREMENTS[0],
      met: input.length >= API_KEY_MIN_LENGTH,
    },
    {
      requirement: API_KEY_REQUIREMENTS[1],
      met: /[A-Z]/u.test(input),
    },
    {
      requirement: API_KEY_REQUIREMENTS[2],
      met: /[a-z]/u.test(input),
    },
    {
      requirement: API_KEY_REQUIREMENTS[3],
      met: /\d/u.test(input),
    },
    {
      requirement: API_KEY_REQUIREMENTS[4],
      met: SPECIAL_CHAR_REGEX.test(input),
    },
  ];
  return checks;
}

export function isApiKeyStrong(value) {
  if (typeof value !== 'string') {
    return false;
  }
  return API_KEY_REGEX.test(value.trim());
}

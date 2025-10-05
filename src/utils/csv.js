export function sanitizeCsvCell(value) {
  const stringValue = value == null ? '' : String(value);
  if (/^[=+\-@]/.test(stringValue)) {
    return `'${stringValue}`;
  }
  return stringValue;
}

export default sanitizeCsvCell;

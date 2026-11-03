export function hasUnsupportedControlCharacters(value: string): boolean {
  return /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(value);
}

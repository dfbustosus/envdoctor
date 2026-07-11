export function escapeHumanText(value: string): string {
  return [...value].map((character) => {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) {
      return '';
    }

    return isUnsafeCodePoint(codePoint)
      ? `\\u{${codePoint.toString(16).padStart(4, '0')}}`
      : character;
  }).join('');
}

function isUnsafeCodePoint(codePoint: number): boolean {
  return codePoint <= 0x1f
    || (codePoint >= 0x7f && codePoint <= 0x9f)
    || codePoint === 0x2028
    || codePoint === 0x2029
    || (codePoint >= 0x202a && codePoint <= 0x202e)
    || (codePoint >= 0x2066 && codePoint <= 0x2069);
}

import { describe, expect, it } from 'vitest';

import { escapeHumanText } from '../src/text.js';

describe('escapeHumanText', () => {
  it('preserves ordinary text', () => {
    expect(escapeHumanText('API_URL src/index.ts')).toBe('API_URL src/index.ts');
  });

  it('escapes control, ANSI, line separator, and bidi characters', () => {
    expect(escapeHumanText('a\n\u001bb\u2028c\u202ed')).toBe(
      'a\\u{000a}\\u{001b}b\\u{2028}c\\u{202e}d'
    );
  });
});

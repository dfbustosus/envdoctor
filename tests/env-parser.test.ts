import { describe, expect, it } from 'vitest';

import { parseEnvContent } from '../src/env-parser.js';

describe('parseEnvContent', () => {
  it('parses dotenv assignments with comments, quotes, empty values, exports, and duplicates', () => {
    const parsed = parseEnvContent(
      '/project/.env',
      [
        '# ignored comment',
        'API_URL="https://example.test/#hash"',
        'EMPTY=',
        "export TOKEN='fake_live_token_123'",
        'API_URL=https://duplicate.example',
        'BROKEN LINE'
      ].join('\n')
    );

    expect(parsed.issues).toHaveLength(1);
    expect(parsed.definitions.map((definition) => definition.key)).toEqual(['API_URL', 'EMPTY', 'TOKEN', 'API_URL']);
    expect(parsed.definitions[0]?.value).toBe('https://example.test/#hash');
    expect(parsed.definitions[1]?.value).toBe('');
    expect(parsed.definitions[2]?.value).toBe('fake_live_token_123');
    expect(parsed.definitions[3]?.line).toBe(5);
  });

  it('supports dotenv key syntax and colon assignments accepted by dotenv', () => {
    const parsed = parseEnvContent(
      '/project/.env',
      ['FOO.BAR=one', 'FOO-BAR: two', 'NORMAL_KEY=value'].join('\n')
    );

    expect(parsed.issues).toEqual([]);
    expect(parsed.definitions.map((definition) => [definition.key, definition.value])).toEqual([
      ['FOO.BAR', 'one'],
      ['FOO-BAR', 'two'],
      ['NORMAL_KEY', 'value']
    ]);
  });

  it('reports unterminated quoted values without hiding later valid definitions', () => {
    const parsed = parseEnvContent('/project/.env', ['BROKEN="abc', 'VALID=value'].join('\n'));

    expect(parsed.issues).toEqual([
      {
        filePath: '/project/.env',
        line: 1,
        message: 'Unterminated quoted dotenv value.'
      }
    ]);
    expect(parsed.definitions.map((definition) => definition.key)).toEqual(['VALID']);
  });

  it('parses BOM, CRLF, multiline quotes, backticks, and escaped double quotes', () => {
    const parsed = parseEnvContent(
      '/project/.env',
      '\uFEFFDOUBLE="line one\\nline two"\r\nMULTILINE="first\r\nsecond"\r\nBACKTICK=`value`\r\nESCAPED="say \\"hello\\""'
    );

    expect(parsed.issues).toEqual([]);
    expect(parsed.definitions.map(({ key, value }) => [key, value])).toEqual([
      ['DOUBLE', 'line one\nline two'],
      ['MULTILINE', 'first\nsecond'],
      ['BACKTICK', 'value'],
      ['ESCAPED', 'say \\"hello\\"']
    ]);
  });
});

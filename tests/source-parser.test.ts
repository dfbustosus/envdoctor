import { describe, expect, it } from 'vitest';

import { parseSourceContent } from '../src/source-parser.js';

describe('parseSourceContent', () => {
  it('detects static JS/TS env usage and marks dynamic usage as uncertain', () => {
    const parsed = parseSourceContent(
      '/project/src/index.ts',
      [
        'export {};',
        'const api = process.env.API_URL;',
        'const db = process.env["DATABASE_URL"];',
        'const { FEATURE_FLAG, RENAMED: alias } = process.env;',
        'const vite = import.meta.env.VITE_PUBLIC_URL;',
        'const dynamic = process.env[envName];',
        'const { ...rest } = import.meta.env;'
      ].join('\n')
    );

    expect(parsed.issues).toEqual([]);
    expect(parsed.usages.map((usage) => usage.key).sort()).toEqual([
      'API_URL',
      'DATABASE_URL',
      'FEATURE_FLAG',
      'RENAMED',
      'VITE_PUBLIC_URL'
    ]);
    expect(parsed.dynamicUsages).toHaveLength(2);
  });

  it('reports recovered parser errors as scan issues', () => {
    const parsed = parseSourceContent('/project/src/broken.ts', 'const value = ;\nprocess.env.API_URL;');

    expect(parsed.issues[0]?.kind).toBe('source-parse-error');
  });
});

import { describe, expect, it } from 'vitest';

import { analyzeScan } from '../src/analyzer.js';

describe('analyzeScan', () => {
  it('classifies missing, unused, duplicated, and exposed-secret findings without leaking values', () => {
    const result = analyzeScan({
      definitions: [
        { filePath: '/project/.env', key: 'API_URL', line: 1, value: 'https://example.test' },
        { filePath: '/project/.env', key: 'UNUSED_FLAG', line: 2, value: 'true' },
        { filePath: '/project/.env', key: 'NEXT_PUBLIC_API_SECRET', line: 3, value: 'fake_live_token_123' },
        { filePath: '/project/.env', key: 'DUPLICATED', line: 4, value: 'one' },
        { filePath: '/project/.env', key: 'DUPLICATED', line: 5, value: 'two' },
        { filePath: '/project/.env.example', key: 'API_URL', line: 1, value: 'https://example.test' },
        { filePath: '/project/.env', key: 'PRIVATE_API_KEY', line: 6, value: 'sk_live_fakevalue123456789' }
      ],
      dynamicUsages: [],
      exampleFileCount: 1,
      envFileCount: 2,
      errorCount: 0,
      knownRuntimeKeys: ['NODE_ENV'],
      publicPrefixes: ['NEXT_PUBLIC_', 'VITE_', 'PUBLIC_'],
      sourceFileCount: 1,
      usages: [
        { filePath: '/project/src/index.ts', key: 'API_URL', line: 1, syntax: 'process-env-dot' },
        { filePath: '/project/src/index.ts', key: 'MISSING_TOKEN', line: 2, syntax: 'process-env-dot' },
        { filePath: '/project/src/index.ts', key: 'DUPLICATED', line: 3, syntax: 'process-env-dot' },
        { filePath: '/project/src/index.ts', key: 'PRIVATE_API_KEY', line: 4, syntax: 'process-env-dot' },
        { filePath: '/project/src/index.ts', key: 'NODE_ENV', line: 4, syntax: 'process-env-dot' }
      ]
    });

    expect(result.totals).toMatchObject({
      duplicated: 1,
      exposedSecrets: 2,
      missing: 1,
      contract: 3,
      unused: 2,
      used: 5
    });
    expect(result.findings.map((finding) => finding.category)).toContain('missing');
    expect(result.findings.map((finding) => finding.category)).toContain('contract');
    expect(result.findings.map((finding) => finding.category)).toContain('unused');
    expect(result.findings.map((finding) => finding.category)).toContain('duplicated');
    expect(result.findings.map((finding) => finding.category)).toContain('exposed-secret');
    expect(JSON.stringify(result.findings)).not.toContain('fake_live_token_123');
    expect(JSON.stringify(result.findings)).not.toContain('sk_live_fakevalue123456789');
    expect(result.findings.filter((finding) => finding.category === 'duplicated')).toHaveLength(1);
    expect(result.findings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      'ENV_MISSING',
      'ENV_EXAMPLE_MISSING_USED_KEY',
      'ENV_DUPLICATED_SAME_FILE',
      'ENV_PUBLIC_SECRET',
      'ENV_SECRET_LIKE_VALUE'
    ]));
    expect(result.findings.every((finding) => finding.confidence === 'high' || finding.confidence === 'medium')).toBe(true);
  });

  it('reports contract drift when an empty .env.example file is present', () => {
    const result = analyzeScan({
      definitions: [{ filePath: '/project/.env', key: 'API_URL', line: 1, value: 'https://example.test' }],
      dynamicUsages: [],
      exampleFileCount: 1,
      envFileCount: 2,
      errorCount: 0,
      knownRuntimeKeys: [],
      publicPrefixes: ['NEXT_PUBLIC_', 'VITE_', 'PUBLIC_'],
      sourceFileCount: 1,
      usages: [{ filePath: '/project/src/index.ts', key: 'API_URL', line: 1, syntax: 'process-env-dot' }]
    });

    expect(result.findings).toContainEqual(expect.objectContaining({
      category: 'contract',
      code: 'ENV_EXAMPLE_MISSING_USED_KEY',
      key: 'API_URL'
    }));
    expect(result.totals).toMatchObject({ missing: 0, contract: 1 });
  });
});

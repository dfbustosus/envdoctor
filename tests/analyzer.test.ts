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
      envFileCount: 2,
      errorCount: 0,
      knownRuntimeKeys: ['NODE_ENV'],
      publicPrefixes: ['NEXT_PUBLIC_', 'VITE_', 'PUBLIC_'],
      sourceFileCount: 1,
      usages: [
        { filePath: '/project/src/index.ts', key: 'API_URL', line: 1, syntax: 'process-env-dot' },
        { filePath: '/project/src/index.ts', key: 'MISSING_TOKEN', line: 2, syntax: 'process-env-dot' },
        { filePath: '/project/src/index.ts', key: 'DUPLICATED', line: 3, syntax: 'process-env-dot' },
        { filePath: '/project/src/index.ts', key: 'NODE_ENV', line: 4, syntax: 'process-env-dot' }
      ]
    });

    expect(result.totals).toMatchObject({
      duplicated: 1,
      exposedSecrets: 2,
      missing: 1,
      unused: 3,
      used: 4
    });
    expect(result.findings.map((finding) => finding.category)).toContain('missing');
    expect(result.findings.map((finding) => finding.category)).toContain('unused');
    expect(result.findings.map((finding) => finding.category)).toContain('duplicated');
    expect(result.findings.map((finding) => finding.category)).toContain('exposed-secret');
    expect(JSON.stringify(result.findings)).not.toContain('fake_live_token_123');
    expect(JSON.stringify(result.findings)).not.toContain('sk_live_fakevalue123456789');
    expect(result.findings.filter((finding) => finding.category === 'duplicated')).toHaveLength(1);
  });
});

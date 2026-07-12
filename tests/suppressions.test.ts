import { describe, expect, it } from 'vitest';

import { applySuppressions } from '../src/suppressions.js';
import type { ScanFinding, SuppressionRule } from '../src/types.js';

const finding: ScanFinding = {
  code: 'ENV_MISSING',
  category: 'missing',
  confidence: 'high',
  severity: 'warning',
  key: 'API_URL',
  message: 'API_URL is missing.',
  locations: [
    { filePath: 'src/a.ts', line: 1 },
    { filePath: 'src/b.ts', line: 2 }
  ]
};

describe('applySuppressions', () => {
  it('matches code and key exactly', () => {
    const rules: SuppressionRule[] = [
      { code: 'ENV_UNUSED', key: 'API_URL', reason: 'Wrong code' },
      { code: 'ENV_MISSING', key: 'api_url', reason: 'Wrong case' }
    ];

    expect(applySuppressions([finding], rules)).toEqual({
      activeFindings: [finding],
      suppressedFindings: []
    });
  });

  it('suppresses every location with a repository-wide rule', () => {
    const suppression: SuppressionRule = {
      code: 'ENV_MISSING',
      key: 'API_URL',
      reason: 'Injected by the deployment platform'
    };

    expect(applySuppressions([finding], [suppression])).toEqual({
      activeFindings: [],
      suppressedFindings: [{ finding, suppression }]
    });
  });

  it('suppresses only the matching location for a file-scoped rule', () => {
    const suppression: SuppressionRule = {
      code: 'ENV_MISSING',
      key: 'API_URL',
      reason: 'This entrypoint receives the value externally',
      filePath: 'src/a.ts'
    };

    const result = applySuppressions([finding], [suppression]);

    expect(result.activeFindings).toEqual([
      { ...finding, locations: [{ filePath: 'src/b.ts', line: 2 }] }
    ]);
    expect(result.suppressedFindings).toEqual([
      {
        finding: { ...finding, locations: [{ filePath: 'src/a.ts', line: 1 }] },
        suppression
      }
    ]);
  });

  it('prefers a file-scoped rule over a repository-wide rule for that location', () => {
    const globalRule: SuppressionRule = {
      code: 'ENV_MISSING',
      key: 'API_URL',
      reason: 'Injected globally'
    };
    const fileRule: SuppressionRule = {
      code: 'ENV_MISSING',
      key: 'API_URL',
      reason: 'Injected in one entrypoint',
      filePath: 'src/a.ts'
    };

    const result = applySuppressions([finding], [globalRule, fileRule]);

    expect(result.activeFindings).toEqual([]);
    expect(result.suppressedFindings).toEqual([
      {
        finding: { ...finding, locations: [{ filePath: 'src/a.ts', line: 1 }] },
        suppression: fileRule
      },
      {
        finding: { ...finding, locations: [{ filePath: 'src/b.ts', line: 2 }] },
        suppression: globalRule
      }
    ]);
  });
});

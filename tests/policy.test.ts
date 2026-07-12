import { describe, expect, it } from 'vitest';

import { determineExitCodeCategory, exitCodeForCategory } from '../src/policy.js';
import type { ScanFinding } from '../src/types.js';

const finding: ScanFinding = {
  code: 'ENV_MISSING',
  category: 'missing',
  confidence: 'high',
  severity: 'warning',
  key: 'API_URL',
  message: 'API_URL is missing.',
  locations: [{ filePath: 'src/index.ts', line: 1 }]
};

describe('exit policy', () => {
  it('prioritizes scan errors over finding policy', () => {
    expect(determineExitCodeCategory([], 1, [])).toBe('error');
  });

  it('fails only configured finding categories', () => {
    expect(determineExitCodeCategory([finding], 0, [])).toBe('clean');
    expect(determineExitCodeCategory([finding], 0, ['unused'])).toBe('clean');
    expect(determineExitCodeCategory([finding], 0, ['missing'])).toBe('findings');
  });

  it('maps categories to stable process exit codes', () => {
    expect(exitCodeForCategory('clean')).toBe(0);
    expect(exitCodeForCategory('findings')).toBe(1);
    expect(exitCodeForCategory('error')).toBe(2);
  });
});

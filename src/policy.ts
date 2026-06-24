import type { ExitCodeCategory, FindingCategory, ScanFinding } from './types.js';

export function determineExitCodeCategory(findings: ScanFinding[], issueCount: number, failOn: FindingCategory[]): ExitCodeCategory {
  if (issueCount > 0) {
    return 'error';
  }

  const failingCategories = new Set(failOn);
  return findings.some((finding) => failingCategories.has(finding.category)) ? 'findings' : 'clean';
}

export function exitCodeForCategory(category: ExitCodeCategory): 0 | 1 | 2 {
  switch (category) {
    case 'clean':
      return 0;
    case 'findings':
      return 1;
    case 'error':
      return 2;
  }
}

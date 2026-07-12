import type { ScanFinding, SuppressedFinding, SuppressionRule } from './types.js';

export interface SuppressionResult {
  activeFindings: ScanFinding[];
  suppressedFindings: SuppressedFinding[];
}

export function applySuppressions(findings: ScanFinding[], suppressions: SuppressionRule[]): SuppressionResult {
  const activeFindings: ScanFinding[] = [];
  const suppressedFindings: SuppressedFinding[] = [];

  for (const finding of findings) {
    const matchingRules = suppressions.filter(
      (suppression) => suppression.code === finding.code && suppression.key === finding.key
    );

    if (matchingRules.length === 0) {
      activeFindings.push(finding);
      continue;
    }

    const globalRule = matchingRules.find((suppression) => suppression.filePath === undefined);
    if (finding.locations.length === 0) {
      if (globalRule === undefined) {
        activeFindings.push(finding);
      } else {
        suppressedFindings.push({ finding, suppression: globalRule });
      }
      continue;
    }

    const activeLocations: ScanFinding['locations'] = [];
    const suppressedLocationsByRule = new Map<SuppressionRule, ScanFinding['locations']>();

    for (const location of finding.locations) {
      const suppression = matchingRules.find((rule) => rule.filePath === location.filePath) ?? globalRule;
      if (suppression === undefined) {
        activeLocations.push(location);
        continue;
      }

      const locations = suppressedLocationsByRule.get(suppression) ?? [];
      locations.push(location);
      suppressedLocationsByRule.set(suppression, locations);
    }

    if (activeLocations.length > 0) {
      activeFindings.push({ ...finding, locations: activeLocations });
    }

    for (const [suppression, locations] of suppressedLocationsByRule) {
      suppressedFindings.push({
        finding: { ...finding, locations },
        suppression
      });
    }
  }

  return { activeFindings, suppressedFindings };
}

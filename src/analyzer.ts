import type { ParsedEnvDefinition } from './internal-types.js';
import { evaluateSecretRisk } from './secrets.js';
import type { DynamicEnvUsage, EnvUsage, ScanFinding, ScanTotals } from './types.js';

export interface AnalyzeInput {
  definitions: ParsedEnvDefinition[];
  usages: EnvUsage[];
  dynamicUsages: DynamicEnvUsage[];
  publicPrefixes: string[];
  knownRuntimeKeys: string[];
  envFileCount: number;
  sourceFileCount: number;
  errorCount: number;
}

export interface AnalyzeResult {
  findings: ScanFinding[];
  totals: ScanTotals;
}

export function analyzeScan(input: AnalyzeInput): AnalyzeResult {
  const findings: ScanFinding[] = [];
  const definitionsByKey = groupByKey(input.definitions);
  const usagesByKey = groupByKey(input.usages);
  const knownRuntimeKeys = new Set(input.knownRuntimeKeys);

  for (const [key, definitions] of definitionsByKey) {
    if (!usagesByKey.has(key) && !knownRuntimeKeys.has(key)) {
      findings.push({
        category: 'unused',
        severity: 'warning',
        key,
        message: `${key} is defined in env files but was not found in scanned source usage.`,
        locations: definitions.map(stripValue),
        details: {
          action: 'Remove the variable, use it in code, or ignore it if it is injected for runtime infrastructure.'
        }
      });
    }
  }

  for (const [key, usages] of usagesByKey) {
    if (!definitionsByKey.has(key) && !knownRuntimeKeys.has(key)) {
      findings.push({
        category: 'missing',
        severity: 'warning',
        key,
        message: `${key} is used in source code but is not defined in the scanned env files.`,
        locations: usages.map(({ filePath, line, column }) => ({
          filePath,
          ...(line === undefined ? {} : { line }),
          ...(column === undefined ? {} : { column })
        })),
        details: {
          action: 'Add the variable to an appropriate env file or document why it is injected externally.'
        }
      });
    }
  }

  for (const [key, definitions] of duplicatedDefinitionsByKey(input.definitions)) {
    if (definitions.length > 1) {
      findings.push({
        category: 'duplicated',
        severity: 'warning',
        key,
        message: `${key} is defined ${definitions.length} times in the same env file.`,
        locations: definitions.map(stripValue),
        details: {
          action: 'Keep one definition in the file or rename the variable if both meanings are intentional.',
          definitionCount: definitions.length
        }
      });
    }
  }

  for (const [key, definitions] of definitionsByKey) {
    const riskyDefinitions = definitions
      .map((definition) => ({ definition, risk: evaluateSecretRisk(definition, input.publicPrefixes) }))
      .filter(({ risk }) => risk.isRisk);

    if (riskyDefinitions.length === 0) {
      continue;
    }

    const reasons = [...new Set(riskyDefinitions.flatMap(({ risk }) => risk.reasons))];
    findings.push({
      category: 'exposed-secret',
      severity: 'warning',
      key,
      message: `${key} looks like it could expose secret material. Raw values are redacted.`,
      locations: riskyDefinitions.map(({ definition }) => stripValue(definition)),
      details: {
        action: 'Remove public prefixes from secrets, replace example values with placeholders, and rotate any exposed credentials.',
        redacted: true,
        reasons
      }
    });
  }

  return {
    findings: sortFindings(findings),
    totals: {
      used: usagesByKey.size,
      unused: countCategory(findings, 'unused'),
      missing: countCategory(findings, 'missing'),
      duplicated: countCategory(findings, 'duplicated'),
      exposedSecrets: countCategory(findings, 'exposed-secret'),
      envFiles: input.envFileCount,
      sourceFiles: input.sourceFileCount,
      dynamicUsages: input.dynamicUsages.length,
      errors: input.errorCount
    }
  };
}

function groupByKey<T extends { key: string }>(entries: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();

  for (const entry of entries) {
    const existing = grouped.get(entry.key) ?? [];
    existing.push(entry);
    grouped.set(entry.key, existing);
  }

  return grouped;
}

function duplicatedDefinitionsByKey(definitions: ParsedEnvDefinition[]): Map<string, ParsedEnvDefinition[]> {
  const byFileAndKey = new Map<string, ParsedEnvDefinition[]>();

  for (const definition of definitions) {
    const identity = `${definition.filePath}\u0000${definition.key}`;
    const existing = byFileAndKey.get(identity) ?? [];
    existing.push(definition);
    byFileAndKey.set(identity, existing);
  }

  const duplicatesByKey = new Map<string, ParsedEnvDefinition[]>();
  for (const duplicateDefinitions of byFileAndKey.values()) {
    if (duplicateDefinitions.length <= 1) {
      continue;
    }

    const key = duplicateDefinitions[0]?.key;
    if (key === undefined) {
      continue;
    }

    const existing = duplicatesByKey.get(key) ?? [];
    duplicatesByKey.set(key, [...existing, ...duplicateDefinitions]);
  }

  return duplicatesByKey;
}

function stripValue(definition: ParsedEnvDefinition): { filePath: string; line?: number; column?: number } {
  return {
    filePath: definition.filePath,
    ...(definition.line === undefined ? {} : { line: definition.line }),
    ...(definition.column === undefined ? {} : { column: definition.column })
  };
}

function countCategory(findings: ScanFinding[], category: ScanFinding['category']): number {
  return findings.filter((finding) => finding.category === category).length;
}

function sortFindings(findings: ScanFinding[]): ScanFinding[] {
  const categoryOrder: Record<ScanFinding['category'], number> = {
    missing: 0,
    'exposed-secret': 1,
    duplicated: 2,
    unused: 3
  };

  return [...findings].sort((left, right) => {
    const categoryDelta = categoryOrder[left.category] - categoryOrder[right.category];
    if (categoryDelta !== 0) {
      return categoryDelta;
    }

    return left.key.localeCompare(right.key);
  });
}

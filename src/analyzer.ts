import type { ParsedEnvDefinition } from './internal-types.js';
import { evaluateSecretRisk } from './secrets.js';
import type { DynamicEnvUsage, EnvUsage, FindingCode, ScanFinding, ScanTotals, SecretRiskReasonCode } from './types.js';

export interface AnalyzeInput {
  definitions: ParsedEnvDefinition[];
  usages: EnvUsage[];
  dynamicUsages: DynamicEnvUsage[];
  publicPrefixes: string[];
  knownRuntimeKeys: string[];
  exampleFileCount: number;
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
  const exampleDefinitionsByKey = groupByKey(input.definitions.filter(isExampleDefinition));
  const hasExampleFile = input.exampleFileCount > 0;

  for (const [key, definitions] of definitionsByKey) {
    if (!usagesByKey.has(key) && !knownRuntimeKeys.has(key)) {
      findings.push({
        code: 'ENV_UNUSED',
        category: 'unused',
        confidence: input.dynamicUsages.length > 0 ? 'medium' : 'high',
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
        code: 'ENV_MISSING',
        category: 'missing',
        confidence: 'high',
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

  if (hasExampleFile) {
    for (const [key, usages] of usagesByKey) {
      if (!exampleDefinitionsByKey.has(key) && !knownRuntimeKeys.has(key)) {
        findings.push({
          code: 'ENV_EXAMPLE_MISSING_USED_KEY',
          category: 'contract',
          confidence: 'high',
          severity: 'warning',
          key,
          message: `${key} is used in source code but is missing from .env.example.`,
          locations: usages.map(({ filePath, line, column }) => ({
            filePath,
            ...(line === undefined ? {} : { line }),
            ...(column === undefined ? {} : { column })
          })),
          details: {
            action: 'Add a safe placeholder for this variable to .env.example so new contributors know it is required.'
          }
        });
      }
    }
  }

  for (const definitions of sameFileDuplicateGroups(input.definitions)) {
    const key = definitions[0]?.key;
    if (key === undefined) {
      continue;
    }

    findings.push({
      code: 'ENV_DUPLICATED_SAME_FILE',
      category: 'duplicated',
      confidence: 'high',
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

  for (const [key, definitions] of definitionsByKey) {
    const riskyDefinitions = definitions
      .map((definition) => ({ definition, risk: evaluateSecretRisk(definition, input.publicPrefixes) }))
      .filter(({ risk }) => risk.isRisk);

    if (riskyDefinitions.length === 0) {
      continue;
    }

    for (const riskGroup of groupHomogeneousSecretRisks(riskyDefinitions)) {
      const reasonCodes = riskGroup[0]?.risk.reasonCodes ?? [];
      const reasons = riskGroup[0]?.risk.reasons ?? [];
      findings.push({
        code: exposedSecretCode(reasonCodes),
        category: 'exposed-secret',
        confidence: 'medium',
        severity: 'warning',
        key,
        message: `${key} looks like it could expose secret material. Raw values are redacted.`,
        locations: riskGroup.map(({ definition }) => stripValue(definition)),
        details: {
          action: 'Remove public prefixes from secrets, replace example values with placeholders, and rotate any exposed credentials.',
          redacted: true,
          reasonCodes,
          reasons
        }
      });
    }
  }

  return {
    findings: sortFindings(findings),
    totals: {
      used: usagesByKey.size,
      unused: countCategory(findings, 'unused'),
      missing: countCategory(findings, 'missing'),
      contract: countCategory(findings, 'contract'),
      duplicated: countCategory(findings, 'duplicated'),
      exposedSecrets: countCategory(findings, 'exposed-secret'),
      envFiles: input.envFileCount,
      sourceFiles: input.sourceFileCount,
      dynamicUsages: input.dynamicUsages.length,
      errors: input.errorCount
    }
  };
}

function isExampleDefinition(definition: ParsedEnvDefinition): boolean {
  return definition.filePath.endsWith('.env.example');
}

function exposedSecretCode(reasonCodes: SecretRiskReasonCode[]): FindingCode {
  if (reasonCodes.includes('PUBLIC_PREFIX_WITH_SECRET_NAME') || reasonCodes.includes('PUBLIC_PREFIX_WITH_SECRET_VALUE')) {
    return 'ENV_PUBLIC_SECRET';
  }

  if (reasonCodes.includes('EXAMPLE_FILE_SECRET_VALUE')) {
    return 'ENV_EXAMPLE_SECRET_VALUE';
  }

  return 'ENV_SECRET_LIKE_VALUE';
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

function sameFileDuplicateGroups(definitions: ParsedEnvDefinition[]): ParsedEnvDefinition[][] {
  const byFileAndKey = new Map<string, ParsedEnvDefinition[]>();

  for (const definition of definitions) {
    const identity = `${definition.filePath}\u0000${definition.key}`;
    const existing = byFileAndKey.get(identity) ?? [];
    existing.push(definition);
    byFileAndKey.set(identity, existing);
  }

  return [...byFileAndKey.values()]
    .filter((group) => group.length > 1)
    .sort((left, right) => {
      const leftDefinition = left[0];
      const rightDefinition = right[0];
      return `${leftDefinition?.filePath ?? ''}\u0000${leftDefinition?.key ?? ''}`
        .localeCompare(`${rightDefinition?.filePath ?? ''}\u0000${rightDefinition?.key ?? ''}`);
    });
}

function groupHomogeneousSecretRisks<T extends { risk: { reasonCodes: SecretRiskReasonCode[] } }>(entries: T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const entry of entries) {
    const identity = [...entry.risk.reasonCodes].sort().join('\u0000');
    const group = groups.get(identity) ?? [];
    group.push(entry);
    groups.set(identity, group);
  }
  return [...groups.values()];
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
    contract: 1,
    'exposed-secret': 2,
    duplicated: 3,
    unused: 4
  };

  return [...findings].sort((left, right) => {
    const categoryDelta = categoryOrder[left.category] - categoryOrder[right.category];
    if (categoryDelta !== 0) {
      return categoryDelta;
    }

    const keyDelta = left.key.localeCompare(right.key);
    if (keyDelta !== 0) {
      return keyDelta;
    }

    return (left.locations[0]?.filePath ?? '').localeCompare(right.locations[0]?.filePath ?? '');
  });
}

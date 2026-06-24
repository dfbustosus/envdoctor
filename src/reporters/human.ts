import type { DynamicEnvUsage, ScanFinding, ScanIssue, ScanResult, SourceLocation } from '../types.js';

export interface HumanReportOptions {
  verbose?: boolean;
}

export function renderHuman(result: ScanResult, options: HumanReportOptions = {}): string {
  const lines: string[] = [
    'env-doctor scan',
    '',
    `OK ${formatCount(result.totals.used, 'variable')} used`,
    '',
    `WARN ${formatCount(result.totals.unused, 'unused')}`,
    `WARN ${formatCount(result.totals.missing, 'missing')}`,
    `WARN ${formatCount(result.totals.contract, 'contract issue')}`,
    `WARN ${formatCount(result.totals.exposedSecrets, 'exposed secret')}`,
    `WARN ${formatCount(result.totals.duplicated, 'duplicated')}`
  ];

  if (result.totals.dynamicUsages > 0) {
    lines.push(`INFO ${formatCount(result.totals.dynamicUsages, 'dynamic env access')} could not be resolved statically`);
  }

  if (result.totals.errors > 0) {
    lines.push(`ERROR ${formatCount(result.totals.errors, 'scan issue')} require attention`);
  }

  if (result.findings.length > 0) {
    lines.push('', 'Findings:');
    for (const finding of result.findings) {
      lines.push(...formatFinding(finding));
    }
  }

  if (result.dynamicUsages.length > 0) {
    lines.push('', 'Analysis limits:');
    for (const dynamicUsage of result.dynamicUsages) {
      lines.push(formatDynamicUsage(dynamicUsage));
    }
  }

  if (result.issues.length > 0) {
    lines.push('', 'Scan issues:');
    for (const issue of result.issues) {
      lines.push(formatIssue(issue));
    }
  }

  if (options.verbose === true) {
    lines.push('', 'Scanned files:', `  Env files: ${result.envFiles.map((file) => file.filePath).join(', ') || 'none'}`, `  Source files: ${result.sourceFiles.length}`);
  }

  if (result.findings.length === 0 && result.issues.length === 0) {
    lines.push('', 'OK No dotenv issues found.');
  }

  return lines.join('\n');
}

function formatFinding(finding: ScanFinding): string[] {
  const lines = [`  WARN ${finding.code} ${finding.key}`, `    ${finding.message}`, `    Confidence: ${finding.confidence}`];
  const action = typeof finding.details?.action === 'string' ? finding.details.action : undefined;
  if (action !== undefined) {
    lines.push(`    Action: ${action}`);
  }

  const reasons = Array.isArray(finding.details?.reasons) ? finding.details.reasons : [];
  for (const reason of reasons) {
    if (typeof reason === 'string') {
      lines.push(`    Reason: ${reason}`);
    }
  }

  for (const location of finding.locations) {
    lines.push(`    at ${formatLocation(location)}`);
  }

  return lines;
}

function formatDynamicUsage(usage: DynamicEnvUsage): string {
  return `  INFO ${formatLocation(usage)} ${usage.reason}`;
}

function formatIssue(issue: ScanIssue): string {
  return `  ERROR ${issue.kind} ${formatLocation(issue)} ${issue.message}`;
}

function formatLocation(location: SourceLocation): string {
  const line = location.line === undefined ? '' : `:${location.line}`;
  const column = location.column === undefined ? '' : `:${location.column}`;
  return `${location.filePath}${line}${column}`;
}

function formatCount(count: number, singular: string): string {
  if (count === 1) {
    return `1 ${singular}`;
  }

  return `${count} ${pluralize(singular)}`;
}

function pluralize(value: string): string {
  if (value === 'unused' || value === 'missing' || value === 'duplicated') {
    return value;
  }

  if (value.endsWith('s')) {
    return value;
  }

  return `${value}s`;
}

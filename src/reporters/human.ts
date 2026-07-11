import type { DynamicEnvUsage, ScanFinding, ScanIssue, ScanResult, SourceLocation } from '../types.js';
import { escapeHumanText } from '../text.js';

export interface HumanReportOptions {
  verbose?: boolean;
}

export function renderHuman(result: ScanResult, options: HumanReportOptions = {}): string {
  const activeFindings = result.activeFindings ?? result.findings;
  const lines: string[] = [
    'env-doctor scan',
    '',
    `OK ${formatCount(result.totals.used, 'variable')} used`,
    '',
    `WARN ${formatCount(countCategory(activeFindings, 'unused'), 'unused')}`,
    `WARN ${formatCount(countCategory(activeFindings, 'missing'), 'missing')}`,
    `WARN ${formatCount(countCategory(activeFindings, 'contract'), 'contract issue')}`,
    `WARN ${formatCount(countCategory(activeFindings, 'exposed-secret'), 'exposed secret')}`,
    `WARN ${formatCount(countCategory(activeFindings, 'duplicated'), 'duplicated')}`
  ];

  if ((result.findingTotals?.suppressedLocations ?? 0) > 0) {
    lines.push(`INFO ${formatCount(result.findingTotals?.suppressedLocations ?? 0, 'suppressed location')}`);
  }

  if (result.totals.dynamicUsages > 0) {
    lines.push(`INFO ${formatCount(result.totals.dynamicUsages, 'dynamic env access')} could not be resolved statically`);
  }

  if (result.totals.errors > 0) {
    lines.push(`ERROR ${formatCount(result.totals.errors, 'scan issue')} require attention`);
  }

  if (activeFindings.length > 0) {
    lines.push('', 'Findings:');
    for (const finding of activeFindings) {
      lines.push(...formatFinding(finding));
    }
  }

  if (options.verbose === true && (result.suppressedFindings?.length ?? 0) > 0) {
    lines.push('', 'Suppressed findings:');
    for (const suppressed of result.suppressedFindings ?? []) {
      lines.push(`  INFO ${escapeHumanText(suppressed.finding.code)} ${escapeHumanText(suppressed.finding.key)}`);
      lines.push(`    Reason: ${escapeHumanText(suppressed.suppression.reason)}`);
      for (const location of suppressed.finding.locations) {
        lines.push(`    at ${formatLocation(location)}`);
      }
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
    lines.push(
      '',
      'Scanned files:',
      `  Env files: ${result.envFiles.map((file) => escapeHumanText(file.filePath)).join(', ') || 'none'}`,
      `  Source files: ${result.sourceFiles.length}`
    );
  }

  if (activeFindings.length === 0 && result.issues.length === 0) {
    lines.push('', (result.findingTotals?.suppressedLocations ?? 0) > 0 ? 'OK No active dotenv issues found.' : 'OK No dotenv issues found.');
  }

  return lines.join('\n');
}

function formatFinding(finding: ScanFinding): string[] {
  const lines = [
    `  WARN ${escapeHumanText(finding.code)} ${escapeHumanText(finding.key)}`,
    `    ${escapeHumanText(finding.message)}`,
    `    Confidence: ${escapeHumanText(finding.confidence)}`
  ];
  const action = typeof finding.details?.action === 'string' ? finding.details.action : undefined;
  if (action !== undefined) {
    lines.push(`    Action: ${escapeHumanText(action)}`);
  }

  const reasons = Array.isArray(finding.details?.reasons) ? finding.details.reasons : [];
  for (const reason of reasons) {
    if (typeof reason === 'string') {
      lines.push(`    Reason: ${escapeHumanText(reason)}`);
    }
  }

  for (const location of finding.locations) {
    lines.push(`    at ${formatLocation(location)}`);
  }

  return lines;
}

function formatDynamicUsage(usage: DynamicEnvUsage): string {
  return `  INFO ${formatLocation(usage)} ${escapeHumanText(usage.reason)}`;
}

function formatIssue(issue: ScanIssue): string {
  return `  ERROR ${escapeHumanText(issue.kind)} ${formatLocation(issue)} ${escapeHumanText(issue.message)}`;
}

function formatLocation(location: SourceLocation): string {
  const line = location.line === undefined ? '' : `:${location.line}`;
  const column = location.column === undefined ? '' : `:${location.column}`;
  return `${escapeHumanText(location.filePath)}${line}${column}`;
}

function countCategory(findings: ScanFinding[], category: ScanFinding['category']): number {
  return findings.filter((finding) => finding.category === category).length;
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

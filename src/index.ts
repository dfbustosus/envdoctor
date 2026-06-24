export { loadConfig } from './config.js';
export { scanProject } from './scanner.js';
export { renderHuman } from './reporters/human.js';
export { renderJson, renderJsonError } from './reporters/json.js';
export type {
  DynamicEnvUsage,
  EnvDefinitionSummary,
  EnvUsage,
  EnvUsageSyntax,
  ExitCodeCategory,
  FindingCategory,
  FindingCode,
  FindingConfidence,
  FindingSeverity,
  JsonErrorReport,
  OutputFormat,
  ResolvedConfig,
  ScanFinding,
  ScanIssue,
  ScanOptions,
  ScanResult,
  ScanTotals,
  ScannedEnvFile,
  SecretRiskReasonCode,
  SourceLocation
} from './types.js';

export { loadConfig } from './config.js';
export { scanProject } from './scanner.js';
export { renderHuman } from './reporters/human.js';
export { renderJson } from './reporters/json.js';
export type {
  DynamicEnvUsage,
  EnvDefinitionSummary,
  EnvUsage,
  EnvUsageSyntax,
  ExitCodeCategory,
  FindingCategory,
  FindingSeverity,
  OutputFormat,
  ResolvedConfig,
  ScanFinding,
  ScanIssue,
  ScanOptions,
  ScanResult,
  ScanTotals,
  ScannedEnvFile,
  SourceLocation
} from './types.js';

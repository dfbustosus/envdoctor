export type FindingCategory = 'unused' | 'missing' | 'duplicated' | 'exposed-secret';

export type FindingSeverity = 'warning' | 'error';

export type ExitCodeCategory = 'clean' | 'findings' | 'error';

export type OutputFormat = 'human' | 'json';

export interface SourceLocation {
  filePath: string;
  line?: number;
  column?: number;
}

export interface ScanOptions {
  cwd?: string;
  envFiles?: string[];
  sourcePaths?: string[];
  ignore?: string[];
  publicPrefixes?: string[];
  failOn?: FindingCategory[];
  format?: OutputFormat;
  verbose?: boolean;
}

export interface ResolvedConfig {
  cwd: string;
  envFileNames: string[];
  envFiles: string[];
  sourcePaths: string[];
  sourceExtensions: string[];
  ignore: string[];
  publicPrefixes: string[];
  failOn: FindingCategory[];
  knownRuntimeKeys: string[];
  maxFileSizeBytes: number;
}

export interface EnvDefinitionSummary extends SourceLocation {
  key: string;
}

export interface ScannedEnvFile {
  filePath: string;
  definitionCount: number;
  keys: EnvDefinitionSummary[];
}

export type EnvUsageSyntax =
  | 'process-env-dot'
  | 'process-env-bracket'
  | 'process-env-destructure'
  | 'import-meta-env-dot'
  | 'import-meta-env-bracket'
  | 'import-meta-env-destructure';

export interface EnvUsage extends SourceLocation {
  key: string;
  syntax: EnvUsageSyntax;
}

export interface DynamicEnvUsage extends SourceLocation {
  syntax: 'process-env-dynamic' | 'import-meta-env-dynamic';
  reason: string;
}

export interface ScanFinding {
  category: FindingCategory;
  severity: FindingSeverity;
  key: string;
  message: string;
  locations: SourceLocation[];
  details?: Record<string, string | string[] | number | boolean>;
}

export interface ScanIssue extends SourceLocation {
  kind: 'env-parse-error' | 'source-parse-error' | 'file-read-error' | 'config-error';
  message: string;
}

export interface ScanTotals {
  used: number;
  unused: number;
  missing: number;
  duplicated: number;
  exposedSecrets: number;
  envFiles: number;
  sourceFiles: number;
  dynamicUsages: number;
  errors: number;
}

export interface ScanResult {
  cwd: string;
  config: {
    envFiles: string[];
    sourcePaths: string[];
    ignore: string[];
    publicPrefixes: string[];
    failOn: FindingCategory[];
  };
  envFiles: ScannedEnvFile[];
  sourceFiles: string[];
  usages: EnvUsage[];
  dynamicUsages: DynamicEnvUsage[];
  findings: ScanFinding[];
  issues: ScanIssue[];
  totals: ScanTotals;
  exitCodeCategory: ExitCodeCategory;
  suggestedExitCode: 0 | 1 | 2;
}

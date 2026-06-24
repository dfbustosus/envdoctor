export type FindingCategory = 'unused' | 'missing' | 'contract' | 'duplicated' | 'exposed-secret';

export type FindingCode =
  | 'ENV_UNUSED'
  | 'ENV_MISSING'
  | 'ENV_EXAMPLE_MISSING_USED_KEY'
  | 'ENV_DUPLICATED_SAME_FILE'
  | 'ENV_PUBLIC_SECRET'
  | 'ENV_EXAMPLE_SECRET_VALUE'
  | 'ENV_SECRET_LIKE_VALUE';

export type FindingConfidence = 'high' | 'medium' | 'low';

export type FindingSeverity = 'warning' | 'error';

export type ExitCodeCategory = 'clean' | 'findings' | 'error';

export type OutputFormat = 'human' | 'json';

export type SecretRiskReasonCode =
  | 'PUBLIC_PREFIX_WITH_SECRET_NAME'
  | 'PUBLIC_PREFIX_WITH_SECRET_VALUE'
  | 'SECRET_LIKE_VALUE'
  | 'SECRET_NAME_WITH_SECRET_VALUE'
  | 'EXAMPLE_FILE_SECRET_VALUE';

export interface ToolMetadata {
  name: 'env-doctor';
  version: string;
}

export interface SourceLocation {
  filePath: string;
  line?: number;
  column?: number;
}

export interface ScanOptions {
  cwd?: string;
  ci?: boolean;
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
  ci: boolean;
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
  code: FindingCode;
  category: FindingCategory;
  confidence: FindingConfidence;
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
  contract: number;
  duplicated: number;
  exposedSecrets: number;
  envFiles: number;
  sourceFiles: number;
  dynamicUsages: number;
  errors: number;
}

export interface ScanResult {
  reportVersion: 1;
  schema: string;
  tool: ToolMetadata;
  cwd: string;
  config: {
    envFiles: string[];
    sourcePaths: string[];
    ignore: string[];
    publicPrefixes: string[];
    failOn: FindingCategory[];
    ci: boolean;
  };
  envFiles: ScannedEnvFile[];
  sourceFiles: string[];
  usages: EnvUsage[];
  dynamicUsages: DynamicEnvUsage[];
  findings: ScanFinding[];
  issues: ScanIssue[];
  totals: ScanTotals;
  exitCode: {
    category: ExitCodeCategory;
    suggested: 0 | 1 | 2;
  };
  exitCodeCategory: ExitCodeCategory;
  suggestedExitCode: 0 | 1 | 2;
}

export interface JsonErrorReport {
  reportVersion: 1;
  schema: string;
  tool: ToolMetadata;
  cwd: string;
  config: {
    envFiles: string[];
    sourcePaths: string[];
    ignore: string[];
    publicPrefixes: string[];
    failOn: FindingCategory[];
    ci: boolean;
  };
  envFiles: ScannedEnvFile[];
  sourceFiles: string[];
  usages: EnvUsage[];
  dynamicUsages: DynamicEnvUsage[];
  findings: ScanFinding[];
  issues: ScanIssue[];
  totals: ScanTotals;
  error: {
    message: string;
  };
  exitCode: {
    category: 'error';
    suggested: 2;
  };
}

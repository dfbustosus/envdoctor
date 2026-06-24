import type { EnvDefinitionSummary } from './types.js';

export interface ParsedEnvDefinition extends EnvDefinitionSummary {
  value: string;
}

export interface EnvParseIssue {
  filePath: string;
  line?: number;
  message: string;
}

export interface ParsedEnvFile {
  filePath: string;
  definitions: ParsedEnvDefinition[];
  issues: EnvParseIssue[];
}

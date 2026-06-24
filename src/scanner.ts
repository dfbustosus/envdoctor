import path from 'node:path';

import { analyzeScan } from './analyzer.js';
import { loadConfig } from './config.js';
import { discoverEnvFiles, discoverSourceFiles } from './discovery.js';
import { parseEnvFile } from './env-parser.js';
import type { ParsedEnvDefinition, ParsedEnvFile } from './internal-types.js';
import { determineExitCodeCategory, exitCodeForCategory } from './policy.js';
import { parseSourceFile, type ParsedSourceFile } from './source-parser.js';
import type { EnvUsage, ScanIssue, ScanOptions, ScanResult, ScannedEnvFile } from './types.js';
import { getToolMetadata, REPORT_SCHEMA_URL, REPORT_VERSION } from './version.js';

export async function scanProject(options: ScanOptions = {}): Promise<ScanResult> {
  const config = await loadConfig(options);
  const envFilePaths = await discoverEnvFiles(config);
  const sourceFilePaths = await discoverSourceFiles(config);

  const parsedEnvFiles = await Promise.all(envFilePaths.map((filePath) => parseEnvFile(filePath)));
  const parsedSourceFiles = await Promise.all(
    sourceFilePaths.map((filePath) => parseSourceFile(filePath, config.maxFileSizeBytes))
  );

  const definitions = parsedEnvFiles.flatMap((file) => file.definitions);
  const usages = dedupeUsages(parsedSourceFiles.flatMap((file) => file.usages));
  const dynamicUsages = parsedSourceFiles.flatMap((file) => file.dynamicUsages);
  const issues = collectIssues(parsedEnvFiles, parsedSourceFiles);

  const analysis = analyzeScan({
    definitions,
    usages,
    dynamicUsages,
    publicPrefixes: config.publicPrefixes,
    knownRuntimeKeys: config.knownRuntimeKeys,
    exampleFileCount: parsedEnvFiles.filter((file) => isExampleEnvFile(file.filePath)).length,
    envFileCount: parsedEnvFiles.length,
    sourceFileCount: parsedSourceFiles.length,
    errorCount: issues.length
  });

  const exitCodeCategory = determineExitCodeCategory(analysis.findings, issues.length, config.failOn);
  const suggestedExitCode = exitCodeForCategory(exitCodeCategory);

  return {
    reportVersion: REPORT_VERSION,
    schema: REPORT_SCHEMA_URL,
    tool: getToolMetadata(),
    cwd: config.cwd,
    config: {
      envFiles: config.envFiles.length > 0 ? config.envFiles.map((filePath) => relativeToCwd(config.cwd, filePath)) : [...config.envFileNames],
      sourcePaths: config.sourcePaths.length > 0 ? config.sourcePaths.map((filePath) => relativeToCwd(config.cwd, filePath)) : ['.'],
      ignore: config.ignore,
      publicPrefixes: config.publicPrefixes,
      failOn: config.failOn,
      ci: config.ci
    },
    envFiles: parsedEnvFiles.map((file) => summarizeEnvFile(config.cwd, file)),
    sourceFiles: sourceFilePaths.map((filePath) => relativeToCwd(config.cwd, filePath)),
    usages: usages.map((usage) => ({
      ...usage,
      filePath: relativeToCwd(config.cwd, usage.filePath)
    })),
    dynamicUsages: dynamicUsages.map((usage) => ({
      ...usage,
      filePath: relativeToCwd(config.cwd, usage.filePath)
    })),
    findings: analysis.findings.map((finding) => ({
      ...finding,
      locations: finding.locations.map((location) => ({
        ...location,
        filePath: relativeToCwd(config.cwd, location.filePath)
      }))
    })),
    issues: issues.map((issue) => ({
      ...issue,
      filePath: relativeToCwd(config.cwd, issue.filePath)
    })),
    totals: analysis.totals,
    exitCode: {
      category: exitCodeCategory,
      suggested: suggestedExitCode
    },
    exitCodeCategory,
    suggestedExitCode
  };
}

function summarizeEnvFile(cwd: string, parsedFile: ParsedEnvFile): ScannedEnvFile {
  return {
    filePath: relativeToCwd(cwd, parsedFile.filePath),
    definitionCount: parsedFile.definitions.length,
    keys: parsedFile.definitions.map(({ filePath, key, line, column }) => ({
      filePath: relativeToCwd(cwd, filePath),
      key,
      ...(line === undefined ? {} : { line }),
      ...(column === undefined ? {} : { column })
    }))
  };
}

function collectIssues(parsedEnvFiles: ParsedEnvFile[], parsedSourceFiles: ParsedSourceFile[]): ScanIssue[] {
  const envIssues: ScanIssue[] = parsedEnvFiles.flatMap((file) =>
    file.issues.map((issue) => ({
      filePath: issue.filePath,
      kind: 'env-parse-error',
      message: issue.message,
      ...(issue.line === undefined ? {} : { line: issue.line })
    }))
  );

  const sourceIssues = parsedSourceFiles.flatMap((file) => file.issues);
  return [...envIssues, ...sourceIssues];
}

function dedupeUsages(usages: EnvUsage[]): EnvUsage[] {
  const seen = new Set<string>();
  const unique: EnvUsage[] = [];

  for (const usage of usages) {
    const identity = `${usage.key}\u0000${usage.filePath}\u0000${usage.line ?? ''}\u0000${usage.column ?? ''}\u0000${usage.syntax}`;
    if (seen.has(identity)) {
      continue;
    }
    seen.add(identity);
    unique.push(usage);
  }

  return unique;
}

function relativeToCwd(cwd: string, filePath: string): string {
  const relative = path.relative(cwd, filePath);
  return relative === '' ? '.' : relative.split(path.sep).join('/');
}

function isExampleEnvFile(filePath: string): boolean {
  return filePath.endsWith('.env.example');
}

export type { ParsedEnvDefinition };

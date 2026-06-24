import type { JsonErrorReport, ScanResult } from '../types.js';
import { getToolMetadata, REPORT_SCHEMA_URL, REPORT_VERSION } from '../version.js';

export function renderJson(result: ScanResult): string {
  return JSON.stringify(result, null, 2);
}

export function renderJsonError(message: string): string {
  const report: JsonErrorReport = {
    reportVersion: REPORT_VERSION,
    schema: REPORT_SCHEMA_URL,
    tool: getToolMetadata(),
    cwd: process.cwd(),
    config: {
      envFiles: [],
      sourcePaths: [],
      ignore: [],
      publicPrefixes: [],
      failOn: [],
      ci: false
    },
    envFiles: [],
    sourceFiles: [],
    usages: [],
    dynamicUsages: [],
    findings: [],
    issues: [
      {
        filePath: '.',
        kind: 'config-error',
        message
      }
    ],
    totals: {
      used: 0,
      unused: 0,
      missing: 0,
      contract: 0,
      duplicated: 0,
      exposedSecrets: 0,
      envFiles: 0,
      sourceFiles: 0,
      dynamicUsages: 0,
      errors: 1
    },
    error: {
      message
    },
    exitCode: {
      category: 'error',
      suggested: 2
    }
  };

  return JSON.stringify(report, null, 2);
}

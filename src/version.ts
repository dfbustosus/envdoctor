import { createRequire } from 'node:module';

import type { ToolMetadata } from './types.js';

export const REPORT_VERSION = 1 as const;
export const REPORT_SCHEMA_URL = 'https://raw.githubusercontent.com/dfbustosus/envdoctor/main/schemas/scan-report-v1.schema.json';
export const TOOL_NAME = 'env-doctor' as const;

const require = createRequire(import.meta.url);

export function getToolMetadata(): ToolMetadata {
  const packageJson = require('../package.json') as { version?: string };
  return {
    name: TOOL_NAME,
    version: packageJson.version ?? '0.0.0'
  };
}

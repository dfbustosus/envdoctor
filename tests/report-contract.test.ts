import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { renderJsonError } from '../src/reporters/json.js';

describe('versioned JSON report contract', () => {
  it('publishes a schema containing stable finding codes', async () => {
    const schemaPath = path.join(process.cwd(), 'schemas/scan-report-v1.schema.json');
    const schema = JSON.parse(await readFile(schemaPath, 'utf8')) as {
      $id: string;
      $defs: { findingCode: { enum: string[] } };
    };

    expect(schema.$id).toContain('scan-report-v1.schema.json');
    expect(schema.$defs.findingCode.enum).toEqual([
      'ENV_UNUSED',
      'ENV_MISSING',
      'ENV_EXAMPLE_MISSING_USED_KEY',
      'ENV_DUPLICATED_SAME_FILE',
      'ENV_PUBLIC_SECRET',
      'ENV_EXAMPLE_SECRET_VALUE',
      'ENV_SECRET_LIKE_VALUE'
    ]);
  });

  it('renders versioned JSON error output', () => {
    const report = JSON.parse(renderJsonError('Unable to scan fixture')) as {
      reportVersion: number;
      schema: string;
      tool: { name: string };
      cwd: string;
      error: { message: string };
      totals: { errors: number };
      issues: unknown[];
      exitCode: { category: string; suggested: number };
    };

    expect(report.reportVersion).toBe(1);
    expect(report.schema).toContain('scan-report-v1.schema.json');
    expect(report.tool.name).toBe('env-doctor');
    expect(report.cwd).toBe(process.cwd());
    expect(report.error.message).toBe('Unable to scan fixture');
    expect(report.totals.errors).toBe(1);
    expect(report.issues).toHaveLength(1);
    expect(report.exitCode).toEqual({ category: 'error', suggested: 2 });
  });
});

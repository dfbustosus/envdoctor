import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { Ajv2020 } from 'ajv/dist/2020.js';
import type { AnySchema, ValidateFunction } from 'ajv/dist/2020.js';
import { afterEach, describe, expect, it } from 'vitest';

import { renderJsonError } from '../src/reporters/json.js';
import { scanProject } from '../src/scanner.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe('versioned JSON report contract', () => {
  it('publishes a schema containing stable finding codes', async () => {
    const schema = await readSchema() as {
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

  it('validates a success report containing a suppressed finding against the published schema', async () => {
    const cwd = await createFixtureProject();
    const report = await scanProject({
      cwd,
      suppressions: [
        {
          code: 'ENV_MISSING',
          key: 'API_URL',
          reason: 'Injected by the deployment platform'
        }
      ]
    });

    const validate = await createValidator();
    const valid = validate(report);

    expect(validate.errors).toEqual(null);
    expect(valid).toBe(true);
    expect(report.findingTotals).toEqual({
      detectedFindings: 1,
      activeFindings: 0,
      suppressedLocations: 1
    });
  });

  it('renders a versioned error report that validates against the published schema', async () => {
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
    const validate = await createValidator();

    expect(validate(report)).toBe(true);
    expect(validate.errors).toEqual(null);
    expect(report.reportVersion).toBe(1);
    expect(report.schema).toContain('scan-report-v1.schema.json');
    expect(report.tool.name).toBe('env-doctor');
    expect(report.cwd).toBe(process.cwd());
    expect(report.error.message).toBe('Unable to scan fixture');
    expect(report.totals.errors).toBe(1);
    expect(report.issues).toHaveLength(1);
    expect(report.exitCode).toEqual({ category: 'error', suggested: 2 });
  });

  it('rejects suppression records without a reason', async () => {
    const validate = await createValidator();
    const invalidReport = {
      reportVersion: 1,
      schema: 'https://example.test/scan-report-v1.schema.json',
      tool: { name: 'env-doctor', version: '0.1.0' },
      cwd: '/project',
      config: {
        envFiles: [],
        sourcePaths: [],
        ignore: [],
        publicPrefixes: [],
        failOn: [],
        suppressions: [{ code: 'ENV_MISSING', key: 'API_URL' }],
        ci: false
      },
      envFiles: [],
      sourceFiles: [],
      usages: [],
      dynamicUsages: [],
      findings: [],
      issues: [],
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
        errors: 0
      },
      exitCode: { category: 'clean', suggested: 0 }
    };

    expect(validate(invalidReport)).toBe(false);
  });

  it('treats explicit empty env and source lists as discovery replacements', async () => {
    const cwd = await createFixtureProject();
    await writeFile(path.join(cwd, '.env'), 'API_URL=https://example.test\n');

    const report = await scanProject({ cwd, envFiles: [], sourcePaths: [] });

    expect(report.envFiles).toEqual([]);
    expect(report.sourceFiles).toEqual([]);
    expect(report.findings).toEqual([]);
    expect(report.config.envFiles).toEqual([]);
    expect(report.config.sourcePaths).toEqual([]);
  });
});

async function createValidator(): Promise<ValidateFunction> {
  const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
  return ajv.compile(await readSchema());
}

async function readSchema(): Promise<AnySchema> {
  const schemaPath = path.join(process.cwd(), 'schemas/scan-report-v1.schema.json');
  return JSON.parse(await readFile(schemaPath, 'utf8')) as AnySchema;
}

async function createFixtureProject(): Promise<string> {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'env-doctor-contract-'));
  temporaryDirectories.push(cwd);
  await mkdir(path.join(cwd, 'src'), { recursive: true });
  await writeFile(path.join(cwd, 'src/index.ts'), 'process.env.API_URL;\n');
  return cwd;
}

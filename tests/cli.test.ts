import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { runCli } from '../src/cli.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe('env-doctor CLI', () => {
  it('prints human scan output without leaking secret values', async () => {
    const fixture = await createFixtureProject();
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    const exitCode = await runCli(['scan', '--cwd', fixture], { stdout, stderr });

    expect(exitCode).toBe(0);
    expect(stderr.output).toBe('');
    expect(stdout.output).toContain('OK 3 variables used');
    expect(stdout.output).toContain('WARN 2 unused');
    expect(stdout.output).toContain('WARN 1 missing');
    expect(stdout.output).toContain('WARN 1 exposed secret');
    expect(stdout.output).toContain('WARN 1 duplicated');
    expect(stdout.output).toContain('WARN ENV_MISSING MISSING_TOKEN');
    expect(stdout.output).toContain('Confidence: high');
    expect(stdout.output).toContain('INFO 1 dynamic env access could not be resolved statically');
    expect(stdout.output).not.toContain('fake_live_token_123');
  });

  it('prints parseable versioned JSON output without leaking secret values', async () => {
    const fixture = await createFixtureProject();
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    const exitCode = await runCli(['scan', '--cwd', fixture, '--json', '--no-fail'], { stdout, stderr });
    const result = JSON.parse(stdout.output) as {
      reportVersion: number;
      schema: string;
      tool: { name: string; version: string };
      totals: { missing: number; exposedSecrets: number };
      findings: Array<{ code: string; confidence: string }>;
      exitCode: { category: string; suggested: number };
    };

    expect(exitCode).toBe(0);
    expect(stderr.output).toBe('');
    expect(result.reportVersion).toBe(1);
    expect(result.schema).toContain('scan-report-v1.schema.json');
    expect(result.tool.name).toBe('env-doctor');
    expect(result.totals.missing).toBe(1);
    expect(result.totals.exposedSecrets).toBe(1);
    expect(result.findings).toHaveLength(5);
    expect(result.findings.map((finding) => finding.code)).toContain('ENV_PUBLIC_SECRET');
    expect(result.findings.every((finding) => finding.confidence === 'high' || finding.confidence === 'medium')).toBe(true);
    expect(result.exitCode).toEqual({ category: 'clean', suggested: 0 });
    expect(stdout.output).not.toContain('fake_live_token_123');
  });

  it('uses --ci to fail on policy findings', async () => {
    const fixture = await createFixtureProject();
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    const exitCode = await runCli(['scan', '--cwd', fixture, '--ci', '--json'], { stdout, stderr });
    const result = JSON.parse(stdout.output) as { config: { ci: boolean; failOn: string[] }; exitCode: { category: string; suggested: number } };

    expect(exitCode).toBe(1);
    expect(stderr.output).toBe('');
    expect(result.config.ci).toBe(true);
    expect(result.config.failOn).toEqual(['missing', 'contract', 'duplicated', 'exposed-secret']);
    expect(result.exitCode).toEqual({ category: 'findings', suggested: 1 });
  });

  it('does not let project config weaken explicit --ci policy', async () => {
    const fixture = await createFixtureProject();
    await writeConfig(fixture, '.env-doctor.json', { ci: false, failOn: [] });
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    const exitCode = await runCli(['scan', '--cwd', fixture, '--ci', '--json'], { stdout, stderr });
    const result = JSON.parse(stdout.output) as { config: { failOn: string[] } };

    expect(exitCode).toBe(1);
    expect(stderr.output).toBe('');
    expect(result.config.failOn).toEqual(['missing', 'contract', 'duplicated', 'exposed-secret']);
  });

  it('reports .env.example contract drift when an example file exists', async () => {
    const fixture = await createFixtureProject({ includeExample: true });
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    const exitCode = await runCli(['scan', '--cwd', fixture, '--json'], { stdout, stderr });
    const result = JSON.parse(stdout.output) as { findings: Array<{ code: string; key: string }> };

    expect(exitCode).toBe(0);
    expect(stderr.output).toBe('');
    expect(result.findings).toContainEqual(expect.objectContaining({
      code: 'ENV_EXAMPLE_MISSING_USED_KEY',
      key: 'MISSING_TOKEN'
    }));
  });

  it('reports .env.example contract drift for an empty example file', async () => {
    const fixture = await createFixtureProject({ includeEmptyExample: true });
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    const exitCode = await runCli(['scan', '--cwd', fixture, '--json'], { stdout, stderr });
    const result = JSON.parse(stdout.output) as { totals: { contract: number }; findings: Array<{ code: string; key: string }> };

    expect(exitCode).toBe(0);
    expect(stderr.output).toBe('');
    expect(result.totals.contract).toBeGreaterThan(0);
    expect(result.findings).toContainEqual(expect.objectContaining({
      code: 'ENV_EXAMPLE_MISSING_USED_KEY',
      key: 'API_URL'
    }));
  });

  it('reports secret-looking .env.example values without leaking them', async () => {
    const fixture = await createFixtureProject({ includeSecretExample: true });
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    const exitCode = await runCli(['scan', '--cwd', fixture, '--json'], { stdout, stderr });
    const result = JSON.parse(stdout.output) as { findings: Array<{ code: string; key: string }> };

    expect(exitCode).toBe(0);
    expect(stderr.output).toBe('');
    expect(result.findings).toContainEqual(expect.objectContaining({
      code: 'ENV_EXAMPLE_SECRET_VALUE',
      key: 'EXAMPLE_API_KEY'
    }));
    expect(stdout.output).not.toContain('sk_live_fakevalue123456789');
  });

  it('auto-discovers suppressions and excludes them from exit policy while retaining audit data', async () => {
    const fixture = await createFixtureProject();
    await writeConfig(fixture, '.env-doctor.json', {
      ci: true,
      failOn: ['missing'],
      suppressions: [
        {
          code: 'ENV_MISSING',
          key: 'MISSING_TOKEN',
          reason: 'Injected by the deployment platform'
        }
      ]
    });
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    const exitCode = await runCli(['scan', '--cwd', fixture, '--json'], { stdout, stderr });
    const result = JSON.parse(stdout.output) as {
      config: { configFile: string; suppressions: unknown[] };
      findings: Array<{ code: string; key: string }>;
      activeFindings: Array<{ code: string; key: string }>;
      suppressedFindings: Array<{ finding: { code: string; key: string }; suppression: { reason: string } }>;
      findingTotals: { detectedFindings: number; activeFindings: number; suppressedLocations: number };
      exitCode: { suggested: number };
    };

    expect(exitCode).toBe(0);
    expect(stderr.output).toBe('');
    expect(result.config.configFile).toBe('.env-doctor.json');
    expect(result.config.suppressions).toHaveLength(1);
    expect(result.findings).toContainEqual(expect.objectContaining({ code: 'ENV_MISSING', key: 'MISSING_TOKEN' }));
    expect(result.activeFindings).not.toContainEqual(expect.objectContaining({ code: 'ENV_MISSING', key: 'MISSING_TOKEN' }));
    expect(result.suppressedFindings).toContainEqual(expect.objectContaining({
      finding: expect.objectContaining({ code: 'ENV_MISSING', key: 'MISSING_TOKEN' }),
      suppression: expect.objectContaining({ reason: 'Injected by the deployment platform' })
    }));
    expect(result.findingTotals).toEqual({ detectedFindings: 5, activeFindings: 4, suppressedLocations: 1 });
    expect(result.exitCode.suggested).toBe(0);
    expect(stdout.output).not.toContain('fake_live_token_123');
  });

  it('uses an explicit config and fails when the matching finding remains active', async () => {
    const fixture = await createFixtureProject();
    await writeConfig(fixture, '.env-doctor.json', {
      ci: true,
      failOn: ['missing'],
      suppressions: [{ code: 'ENV_MISSING', key: 'MISSING_TOKEN', reason: 'Discovered config rule' }]
    });
    await writeConfig(fixture, 'alternate.json', { ci: true, failOn: ['missing'], suppressions: [] });
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    const exitCode = await runCli(['scan', '--cwd', fixture, '--config', 'alternate.json', '--json'], { stdout, stderr });
    const result = JSON.parse(stdout.output) as { config: { configFile: string }; findingTotals: { suppressedLocations: number } };

    expect(exitCode).toBe(1);
    expect(stderr.output).toBe('');
    expect(result.config.configFile).toBe('alternate.json');
    expect(result.findingTotals.suppressedLocations).toBe(0);
  });

  it('keeps invalid config as exit code 2 even with --no-fail', async () => {
    const fixture = await createFixtureProject();
    await writeFile(
      path.join(fixture, '.env-doctor.json'),
      JSON.stringify({ suppressions: [{ code: 'ENV_MISSING', key: 'MISSING_TOKEN', raw: 'fake_live_token_123' }] })
    );
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    const exitCode = await runCli(['scan', '--cwd', fixture, '--json', '--no-fail'], { stdout, stderr });
    const result = JSON.parse(stdout.output) as { cwd: string; error: { message: string }; exitCode: { suggested: number } };

    expect(exitCode).toBe(2);
    expect(stderr.output).toBe('');
    expect(result.cwd).toBe(fixture);
    expect(result.error.message).toContain('unknown property');
    expect(result.exitCode.suggested).toBe(2);
    expect(stdout.output).not.toContain('fake_live_token_123');
  });

  it('escapes control characters in verbose suppression reasons', async () => {
    const fixture = await createFixtureProject();
    await writeConfig(fixture, '.env-doctor.json', {
      suppressions: [
        {
          code: 'ENV_MISSING',
          key: 'MISSING_TOKEN',
          reason: 'platform\n\u001b[31mforged'
        }
      ]
    });
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    const exitCode = await runCli(['scan', '--cwd', fixture, '--verbose'], { stdout, stderr });

    expect(exitCode).toBe(0);
    expect(stderr.output).toBe('');
    expect(stdout.output).toContain('Reason: platform\\u{000a}\\u{001b}[31mforged');
    expect(stdout.output).not.toContain('platform\n');
    expect(stdout.output).not.toContain('\u001b');
  });

  it('reports finding records and suppressed locations as distinct counting units', async () => {
    const fixture = await createFixtureProject({ includeSecondMissingUsage: true });
    await writeConfig(fixture, '.env-doctor.json', {
      suppressions: [
        {
          code: 'ENV_MISSING',
          key: 'MISSING_TOKEN',
          filePath: 'src/index.ts',
          reason: 'Injected into the primary entrypoint'
        },
        {
          code: 'ENV_MISSING',
          key: 'MISSING_TOKEN',
          filePath: 'src/secondary.ts',
          reason: 'Injected into the secondary entrypoint'
        }
      ]
    });
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    const exitCode = await runCli(['scan', '--cwd', fixture, '--json'], { stdout, stderr });
    const result = JSON.parse(stdout.output) as {
      suppressedFindings: unknown[];
      findingTotals: { detectedFindings: number; activeFindings: number; suppressedLocations: number };
    };

    expect(exitCode).toBe(0);
    expect(stderr.output).toBe('');
    expect(result.suppressedFindings).toHaveLength(2);
    expect(result.findingTotals).toEqual({
      detectedFindings: 5,
      activeFindings: 4,
      suppressedLocations: 2
    });
  });

  it('describes a fully suppressed human scan as having no active issues', async () => {
    const fixture = await createMissingOnlyProject();
    await writeConfig(fixture, '.env-doctor.json', {
      suppressions: [
        {
          code: 'ENV_MISSING',
          key: 'PLATFORM_URL',
          reason: 'Injected by the deployment platform'
        }
      ]
    });
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    const exitCode = await runCli(['scan', '--cwd', fixture, '--verbose'], { stdout, stderr });

    expect(exitCode).toBe(0);
    expect(stderr.output).toBe('');
    expect(stdout.output).toContain('INFO 1 suppressed location');
    expect(stdout.output).toContain('OK No active dotenv issues found.');
    expect(stdout.output).not.toContain('OK No dotenv issues found.');
  });
});

async function createFixtureProject(options: {
  includeExample?: boolean;
  includeEmptyExample?: boolean;
  includeSecretExample?: boolean;
  includeSecondMissingUsage?: boolean;
} = {}): Promise<string> {
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'env-doctor-'));
  temporaryDirectories.push(fixture);
  await mkdir(path.join(fixture, 'src'), { recursive: true });
  await writeFile(
    path.join(fixture, '.env'),
    [
      'API_URL=https://example.test',
      'UNUSED_FLAG=true',
      'DUPLICATED=one',
      'DUPLICATED=two',
      'NEXT_PUBLIC_API_SECRET=fake_live_token_123'
    ].join('\n')
  );
  await writeFile(
    path.join(fixture, 'src/index.ts'),
    [
      'const api = process.env.API_URL;',
      'const missing = process.env.MISSING_TOKEN;',
      'const { DUPLICATED } = process.env;',
      'const dynamic = process.env[globalThis.name as string];',
      'void api; void missing; void DUPLICATED; void dynamic;'
    ].join('\n')
  );

  if (options.includeExample === true) {
    await writeFile(path.join(fixture, '.env.example'), ['API_URL=', 'DUPLICATED='].join('\n'));
  }

  if (options.includeEmptyExample === true) {
    await writeFile(path.join(fixture, '.env.example'), '# document required env variables here\n');
  }

  if (options.includeSecretExample === true) {
    await writeFile(path.join(fixture, '.env.example'), ['API_URL=', 'DUPLICATED=', 'EXAMPLE_API_KEY=sk_live_fakevalue123456789'].join('\n'));
  }

  if (options.includeSecondMissingUsage === true) {
    await writeFile(path.join(fixture, 'src/secondary.ts'), 'process.env.MISSING_TOKEN;\n');
  }

  return fixture;
}

async function writeConfig(fixture: string, fileName: string, config: unknown): Promise<void> {
  await writeFile(path.join(fixture, fileName), JSON.stringify(config, null, 2));
}

async function createMissingOnlyProject(): Promise<string> {
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'env-doctor-missing-'));
  temporaryDirectories.push(fixture);
  await mkdir(path.join(fixture, 'src'), { recursive: true });
  await writeFile(path.join(fixture, 'src/index.ts'), 'process.env.PLATFORM_URL;\n');
  return fixture;
}

function createWritableBuffer(): { output: string; write: (chunk: string | Uint8Array) => boolean } {
  return {
    output: '',
    write(chunk: string | Uint8Array): boolean {
      this.output += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
      return true;
    }
  };
}

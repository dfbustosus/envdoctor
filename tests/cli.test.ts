import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { runCli } from '../src/cli.js';

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
});

async function createFixtureProject(options: { includeExample?: boolean; includeEmptyExample?: boolean; includeSecretExample?: boolean } = {}): Promise<string> {
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'env-doctor-'));
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

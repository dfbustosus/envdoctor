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

    const exitCode = await runCli(['scan', '--cwd', fixture, '--no-fail'], { stdout, stderr });

    expect(exitCode).toBe(0);
    expect(stderr.output).toBe('');
    expect(stdout.output).toContain('OK 3 variables used');
    expect(stdout.output).toContain('WARN 2 unused');
    expect(stdout.output).toContain('WARN 1 missing');
    expect(stdout.output).toContain('WARN 1 exposed secret');
    expect(stdout.output).toContain('WARN 1 duplicated');
    expect(stdout.output).toContain('INFO 1 dynamic env access could not be resolved statically');
    expect(stdout.output).not.toContain('fake_live_token_123');
  });

  it('prints parseable JSON output for CI', async () => {
    const fixture = await createFixtureProject();
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    const exitCode = await runCli(['scan', '--cwd', fixture, '--json', '--no-fail'], { stdout, stderr });
    const result = JSON.parse(stdout.output) as { totals: { missing: number; exposedSecrets: number }; findings: unknown[] };

    expect(exitCode).toBe(0);
    expect(stderr.output).toBe('');
    expect(result.totals.missing).toBe(1);
    expect(result.totals.exposedSecrets).toBe(1);
    expect(result.findings).toHaveLength(5);
    expect(stdout.output).not.toContain('fake_live_token_123');
  });
});

async function createFixtureProject(): Promise<string> {
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

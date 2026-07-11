import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe('loadConfig', () => {
  it('adds custom public prefixes without removing built-in prefixes', async () => {
    const config = await loadConfig({ publicPrefixes: ['CLIENT_PUBLIC_'] });

    expect(config.publicPrefixes).toEqual(['NEXT_PUBLIC_', 'VITE_', 'PUBLIC_', 'CLIENT_PUBLIC_']);
  });

  it('keeps local scans non-failing by default and makes CI scans stricter', async () => {
    await expect(loadConfig()).resolves.toMatchObject({ ci: false, failOn: [] });
    await expect(loadConfig({ ci: true })).resolves.toMatchObject({
      ci: true,
      failOn: ['missing', 'contract', 'duplicated', 'exposed-secret']
    });
  });

  it('discovers and validates .env-doctor.json from the effective cwd', async () => {
    const cwd = await createTemporaryDirectory();
    await writeJson(path.join(cwd, '.env-doctor.json'), {
      configVersion: 1,
      ci: true,
      failOn: ['missing'],
      ignore: ['**/generated/**'],
      suppressions: [
        {
          code: 'ENV_MISSING',
          key: 'VERCEL_URL',
          reason: 'Injected by the deployment platform',
          filePath: './src/runtime.ts'
        }
      ]
    });

    const config = await loadConfig({ cwd });

    expect(config.configFile).toBe(path.join(cwd, '.env-doctor.json'));
    expect(config.ci).toBe(true);
    expect(config.failOn).toEqual(['missing']);
    expect(config.ignore).toContain('**/generated/**');
    expect(config.suppressions).toEqual([
      {
        code: 'ENV_MISSING',
        key: 'VERCEL_URL',
        reason: 'Injected by the deployment platform',
        filePath: 'src/runtime.ts'
      }
    ]);
  });

  it('uses an explicit config instead of the discovered config', async () => {
    const cwd = await createTemporaryDirectory();
    await writeJson(path.join(cwd, '.env-doctor.json'), { ci: true, failOn: ['missing'] });
    await writeJson(path.join(cwd, 'strict.json'), { ci: false, failOn: ['unused'] });

    const config = await loadConfig({ cwd, configFile: 'strict.json' });

    expect(config.configFile).toBe(path.join(cwd, 'strict.json'));
    expect(config.ci).toBe(false);
    expect(config.failOn).toEqual(['unused']);
  });

  it('lets explicit options override config values including false and empty arrays', async () => {
    const cwd = await createTemporaryDirectory();
    await writeJson(path.join(cwd, '.env-doctor.json'), {
      ci: true,
      failOn: ['missing'],
      publicPrefixes: ['CLIENT_PUBLIC_'],
      suppressions: [{ code: 'ENV_MISSING', key: 'API_URL', reason: 'Injected externally' }]
    });

    const config = await loadConfig({
      cwd,
      ci: false,
      envFiles: [],
      sourcePaths: [],
      failOn: [],
      publicPrefixes: [],
      suppressions: []
    });

    expect(config.ci).toBe(false);
    expect(config.envFilesExplicit).toBe(true);
    expect(config.sourcePathsExplicit).toBe(true);
    expect(config.failOn).toEqual([]);
    expect(config.publicPrefixes).toEqual(['NEXT_PUBLIC_', 'VITE_', 'PUBLIC_']);
    expect(config.suppressions).toEqual([]);
  });

  it('makes explicit CI mode enforce CI defaults unless failOn is explicit on the invocation', async () => {
    const cwd = await createTemporaryDirectory();
    await writeJson(path.join(cwd, '.env-doctor.json'), { ci: false, failOn: [] });

    await expect(loadConfig({ cwd, ci: true })).resolves.toMatchObject({
      ci: true,
      failOn: ['missing', 'contract', 'duplicated', 'exposed-secret']
    });
    await expect(loadConfig({ cwd, ci: true, failOn: [] })).resolves.toMatchObject({
      ci: true,
      failOn: []
    });
  });

  it.each([
    ['malformed JSON', '{', 'is not valid JSON'],
    ['unknown property', JSON.stringify({ supressions: [] }), '$.supressions'],
    ['unsupported code', JSON.stringify({ suppressions: [{ code: 'ENV_UNKNOWN', key: 'API_URL', reason: 'External' }] }), 'suppressions[0].code'],
    ['empty key', JSON.stringify({ suppressions: [{ code: 'ENV_MISSING', key: ' ', reason: 'External' }] }), 'suppressions[0].key'],
    ['missing reason', JSON.stringify({ suppressions: [{ code: 'ENV_MISSING', key: 'API_URL' }] }), 'suppressions[0].reason'],
    ['empty reason', JSON.stringify({ suppressions: [{ code: 'ENV_MISSING', key: 'API_URL', reason: ' ' }] }), 'suppressions[0].reason'],
    ['duplicate rule', JSON.stringify({ suppressions: [
      { code: 'ENV_MISSING', key: 'API_URL', reason: 'External one' },
      { code: 'ENV_MISSING', key: 'API_URL', reason: 'External two' }
    ] }), 'duplicates an earlier suppression rule']
  ])('rejects %s without echoing config contents', async (_name, content, expectedMessage) => {
    const cwd = await createTemporaryDirectory();
    await writeFile(path.join(cwd, '.env-doctor.json'), content);

    await expect(loadConfig({ cwd })).rejects.toThrow(expectedMessage);
    await expect(loadConfig({ cwd })).rejects.not.toThrow('External two');
  });

  it('fails when an explicit config file does not exist', async () => {
    const cwd = await createTemporaryDirectory();

    await expect(loadConfig({ cwd, configFile: 'missing.json' })).rejects.toThrow('Config file was not found');
  });
});

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'env-doctor-config-'));
  temporaryDirectories.push(directory);
  return directory;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, JSON.stringify(value, null, 2));
}

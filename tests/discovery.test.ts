import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config.js';
import { discoverEnvFiles, discoverSourceFiles } from '../src/discovery.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe('file discovery', () => {
  it('discovers supported files recursively and respects default ignores', async () => {
    const cwd = await createProject();
    const config = await loadConfig({ cwd });

    await expect(discoverEnvFiles(config)).resolves.toEqual([
      path.join(cwd, '.env'),
      path.join(cwd, 'apps/web/.env.example')
    ]);
    await expect(discoverSourceFiles(config)).resolves.toEqual([
      path.join(cwd, 'apps/web/src/index.ts'),
      path.join(cwd, 'src/index.js')
    ]);
  });

  it('uses explicit files and directory source paths as discovery replacements', async () => {
    const cwd = await createProject();
    const config = await loadConfig({
      cwd,
      envFiles: ['apps/web/.env.example'],
      sourcePaths: ['apps/web/src']
    });

    await expect(discoverEnvFiles(config)).resolves.toEqual([path.join(cwd, 'apps/web/.env.example')]);
    await expect(discoverSourceFiles(config)).resolves.toEqual([path.join(cwd, 'apps/web/src/index.ts')]);
  });

  it('honors explicit empty discovery replacements', async () => {
    const cwd = await createProject();
    const config = await loadConfig({ cwd, envFiles: [], sourcePaths: [] });

    await expect(discoverEnvFiles(config)).resolves.toEqual([]);
    await expect(discoverSourceFiles(config)).resolves.toEqual([]);
  });
});

async function createProject(): Promise<string> {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'env-doctor-discovery-'));
  temporaryDirectories.push(cwd);
  await Promise.all([
    mkdir(path.join(cwd, 'src'), { recursive: true }),
    mkdir(path.join(cwd, 'apps/web/src'), { recursive: true }),
    mkdir(path.join(cwd, 'dist'), { recursive: true }),
    mkdir(path.join(cwd, 'node_modules/example'), { recursive: true })
  ]);
  await Promise.all([
    writeFile(path.join(cwd, '.env'), 'API_URL=example\n'),
    writeFile(path.join(cwd, 'apps/web/.env.example'), 'WEB_URL=\n'),
    writeFile(path.join(cwd, 'src/index.js'), 'process.env.API_URL;\n'),
    writeFile(path.join(cwd, 'apps/web/src/index.ts'), 'process.env.WEB_URL;\n'),
    writeFile(path.join(cwd, 'dist/index.js'), 'process.env.IGNORED;\n'),
    writeFile(path.join(cwd, 'node_modules/example/index.js'), 'process.env.IGNORED;\n')
  ]);
  return cwd;
}

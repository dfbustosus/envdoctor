import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config.js';

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
});

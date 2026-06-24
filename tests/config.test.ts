import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('adds custom public prefixes without removing built-in prefixes', async () => {
    const config = await loadConfig({ publicPrefixes: ['CLIENT_PUBLIC_'] });

    expect(config.publicPrefixes).toEqual(['NEXT_PUBLIC_', 'VITE_', 'PUBLIC_', 'CLIENT_PUBLIC_']);
  });
});

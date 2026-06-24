import path from 'node:path';

import type { FindingCategory, ResolvedConfig, ScanOptions } from './types.js';

export const DEFAULT_ENV_FILE_NAMES = ['.env', '.env.local', '.env.prod', '.env.stage', '.env.example'] as const;

export const DEFAULT_SOURCE_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts'] as const;

export const DEFAULT_IGNORE = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/coverage/**',
  '**/.turbo/**',
  '**/out/**',
  '**/.nuxt/**',
  '**/.output/**',
  '**/.svelte-kit/**',
  '**/.cache/**',
  '**/*.d.ts',
  '**/*.min.js'
] as const;

export const DEFAULT_PUBLIC_PREFIXES = ['NEXT_PUBLIC_', 'VITE_', 'PUBLIC_'] as const;

export const DEFAULT_FAIL_ON: FindingCategory[] = ['unused', 'missing', 'duplicated', 'exposed-secret'];

export const DEFAULT_KNOWN_RUNTIME_KEYS = ['NODE_ENV'] as const;

export async function loadConfig(options: ScanOptions = {}): Promise<ResolvedConfig> {
  const cwd = path.resolve(options.cwd ?? process.cwd());

  return {
    cwd,
    envFileNames: [...DEFAULT_ENV_FILE_NAMES],
    envFiles: normalizePaths(options.envFiles ?? [], cwd),
    sourcePaths: normalizePaths(options.sourcePaths ?? [], cwd),
    sourceExtensions: [...DEFAULT_SOURCE_EXTENSIONS],
    ignore: [...DEFAULT_IGNORE, ...(options.ignore ?? [])],
    publicPrefixes: unique([...(DEFAULT_PUBLIC_PREFIXES as readonly string[]), ...(options.publicPrefixes ?? [])]),
    failOn: options.failOn ?? [...DEFAULT_FAIL_ON],
    knownRuntimeKeys: [...DEFAULT_KNOWN_RUNTIME_KEYS],
    maxFileSizeBytes: 1024 * 1024
  };
}

function normalizePaths(paths: string[], cwd: string): string[] {
  return paths.map((entry) => (path.isAbsolute(entry) ? path.normalize(entry) : path.resolve(cwd, entry)));
}

function unique(entries: string[]): string[] {
  return [...new Set(entries)];
}

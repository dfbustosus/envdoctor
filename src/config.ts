import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  EnvDoctorConfig,
  FindingCategory,
  FindingCode,
  ResolvedConfig,
  ScanOptions,
  SuppressionRule
} from './types.js';

export const DEFAULT_CONFIG_FILE_NAME = '.env-doctor.json';
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
export const DEFAULT_FAIL_ON: FindingCategory[] = [];
export const DEFAULT_CI_FAIL_ON: FindingCategory[] = ['missing', 'contract', 'duplicated', 'exposed-secret'];
export const DEFAULT_KNOWN_RUNTIME_KEYS = ['NODE_ENV'] as const;

const FINDING_CATEGORIES = ['unused', 'missing', 'contract', 'duplicated', 'exposed-secret'] as const satisfies readonly FindingCategory[];
const FINDING_CODES = [
  'ENV_UNUSED',
  'ENV_MISSING',
  'ENV_EXAMPLE_MISSING_USED_KEY',
  'ENV_DUPLICATED_SAME_FILE',
  'ENV_PUBLIC_SECRET',
  'ENV_EXAMPLE_SECRET_VALUE',
  'ENV_SECRET_LIKE_VALUE'
] as const satisfies readonly FindingCode[];
const CONFIG_PROPERTIES = new Set([
  'configVersion',
  'ci',
  'envFiles',
  'sourcePaths',
  'ignore',
  'publicPrefixes',
  'failOn',
  'suppressions'
]);
const SUPPRESSION_PROPERTIES = new Set(['code', 'key', 'reason', 'filePath']);

export async function loadConfig(options: ScanOptions = {}): Promise<ResolvedConfig> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const loaded = await loadProjectConfig(cwd, options.configFile);
  const fileConfig = loaded.config;
  const ci = options.ci ?? fileConfig.ci ?? false;
  const failOn = options.failOn
    ?? (options.ci === true ? [...DEFAULT_CI_FAIL_ON] : fileConfig.failOn)
    ?? (ci ? [...DEFAULT_CI_FAIL_ON] : [...DEFAULT_FAIL_ON]);
  const envFiles = options.envFiles ?? fileConfig.envFiles ?? [];
  const sourcePaths = options.sourcePaths ?? fileConfig.sourcePaths ?? [];
  const envFilesExplicit = options.envFiles !== undefined || fileConfig.envFiles !== undefined;
  const sourcePathsExplicit = options.sourcePaths !== undefined || fileConfig.sourcePaths !== undefined;
  const customIgnore = options.ignore ?? fileConfig.ignore ?? [];
  const customPublicPrefixes = options.publicPrefixes ?? fileConfig.publicPrefixes ?? [];
  const suppressions = normalizeSuppressions(options.suppressions ?? fileConfig.suppressions ?? [], cwd, 'suppressions');

  return {
    cwd,
    ci,
    ...(loaded.filePath === undefined ? {} : { configFile: loaded.filePath }),
    envFileNames: [...DEFAULT_ENV_FILE_NAMES],
    envFiles: normalizePaths(envFiles, cwd),
    envFilesExplicit,
    sourcePaths: normalizePaths(sourcePaths, cwd),
    sourcePathsExplicit,
    sourceExtensions: [...DEFAULT_SOURCE_EXTENSIONS],
    ignore: [...DEFAULT_IGNORE, ...customIgnore],
    publicPrefixes: unique([...(DEFAULT_PUBLIC_PREFIXES as readonly string[]), ...customPublicPrefixes]),
    failOn,
    suppressions,
    knownRuntimeKeys: [...DEFAULT_KNOWN_RUNTIME_KEYS],
    maxFileSizeBytes: 1024 * 1024
  };
}

async function loadProjectConfig(
  cwd: string,
  explicitConfigFile: string | undefined
): Promise<{ config: EnvDoctorConfig; filePath?: string }> {
  const explicit = explicitConfigFile !== undefined;
  const filePath = explicit ? path.resolve(cwd, explicitConfigFile) : path.join(cwd, DEFAULT_CONFIG_FILE_NAME);

  let content: string;
  try {
    content = await readFile(filePath, 'utf8');
  } catch (error) {
    if (!explicit && isNodeError(error) && error.code === 'ENOENT') {
      return { config: {} };
    }

    if (explicit && isNodeError(error) && error.code === 'ENOENT') {
      throw new Error(`Config file was not found at ${safeRelativePath(cwd, filePath)}.`);
    }

    throw new Error(`Unable to read config file at ${safeRelativePath(cwd, filePath)}.`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content.replace(/^\uFEFF/u, '')) as unknown;
  } catch {
    throw new Error(`Config file at ${safeRelativePath(cwd, filePath)} is not valid JSON.`);
  }

  return {
    config: validateProjectConfig(parsed, cwd),
    filePath
  };
}

function validateProjectConfig(value: unknown, cwd: string): EnvDoctorConfig {
  if (!isPlainObject(value)) {
    throw configError('$', 'expected an object');
  }

  rejectUnknownProperties(value, CONFIG_PROPERTIES, '$');

  const config: EnvDoctorConfig = {};
  if ('configVersion' in value) {
    if (value.configVersion !== 1) {
      throw configError('configVersion', 'expected 1');
    }
    config.configVersion = 1;
  }
  if ('ci' in value) {
    if (typeof value.ci !== 'boolean') {
      throw configError('ci', 'expected a boolean');
    }
    config.ci = value.ci;
  }
  if ('envFiles' in value) {
    config.envFiles = validateStringArray(value.envFiles, 'envFiles');
  }
  if ('sourcePaths' in value) {
    config.sourcePaths = validateStringArray(value.sourcePaths, 'sourcePaths');
  }
  if ('ignore' in value) {
    config.ignore = validateStringArray(value.ignore, 'ignore');
  }
  if ('publicPrefixes' in value) {
    config.publicPrefixes = validateStringArray(value.publicPrefixes, 'publicPrefixes');
  }
  if ('failOn' in value) {
    config.failOn = validateFindingCategories(value.failOn, 'failOn');
  }
  if ('suppressions' in value) {
    config.suppressions = normalizeSuppressions(value.suppressions, cwd, 'suppressions');
  }

  return config;
}

function normalizeSuppressions(value: unknown, cwd: string, fieldPath: string): SuppressionRule[] {
  if (!Array.isArray(value)) {
    throw configError(fieldPath, 'expected an array');
  }

  const suppressions = value.map((entry, index): SuppressionRule => {
    const entryPath = `${fieldPath}[${index}]`;
    if (!isPlainObject(entry)) {
      throw configError(entryPath, 'expected an object');
    }
    rejectUnknownProperties(entry, SUPPRESSION_PROPERTIES, entryPath);

    const code = validateFindingCode(entry.code, `${entryPath}.code`);
    const key = validateNonEmptyString(entry.key, `${entryPath}.key`);
    const reason = validateNonEmptyString(entry.reason, `${entryPath}.reason`);
    const filePath = entry.filePath === undefined
      ? undefined
      : normalizeReportPath(cwd, validateNonEmptyString(entry.filePath, `${entryPath}.filePath`));

    return {
      code,
      key,
      reason,
      ...(filePath === undefined ? {} : { filePath })
    };
  });

  const identities = new Set<string>();
  for (const [index, suppression] of suppressions.entries()) {
    const identity = `${suppression.code}\u0000${suppression.key}\u0000${suppression.filePath ?? ''}`;
    if (identities.has(identity)) {
      throw configError(`${fieldPath}[${index}]`, 'duplicates an earlier suppression rule');
    }
    identities.add(identity);
  }

  return suppressions;
}

function validateFindingCategories(value: unknown, fieldPath: string): FindingCategory[] {
  if (!Array.isArray(value)) {
    throw configError(fieldPath, 'expected an array');
  }

  return value.map((entry, index) => {
    if (typeof entry !== 'string' || !FINDING_CATEGORIES.includes(entry as FindingCategory)) {
      throw configError(`${fieldPath}[${index}]`, 'expected a supported finding category');
    }
    return entry as FindingCategory;
  });
}

function validateFindingCode(value: unknown, fieldPath: string): FindingCode {
  if (typeof value !== 'string' || !FINDING_CODES.includes(value as FindingCode)) {
    throw configError(fieldPath, 'expected a supported finding code');
  }
  return value as FindingCode;
}

function validateStringArray(value: unknown, fieldPath: string): string[] {
  if (!Array.isArray(value)) {
    throw configError(fieldPath, 'expected an array');
  }

  return value.map((entry, index) => validateNonEmptyString(entry, `${fieldPath}[${index}]`));
}

function validateNonEmptyString(value: unknown, fieldPath: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw configError(fieldPath, 'expected a non-empty string');
  }
  return value.trim();
}

function rejectUnknownProperties(value: Record<string, unknown>, allowed: Set<string>, fieldPath: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key)).sort()[0];
  if (unknown !== undefined) {
    throw configError(`${fieldPath}.${unknown}`, 'unknown property');
  }
}

function normalizePaths(paths: string[], cwd: string): string[] {
  return paths.map((entry) => (path.isAbsolute(entry) ? path.normalize(entry) : path.resolve(cwd, entry)));
}

function normalizeReportPath(cwd: string, filePath: string): string {
  const absolute = path.isAbsolute(filePath) ? path.normalize(filePath) : path.resolve(cwd, filePath);
  const relative = path.relative(cwd, absolute);
  return (relative === '' ? '.' : relative).split(path.sep).join('/');
}

function safeRelativePath(cwd: string, filePath: string): string {
  return JSON.stringify(normalizeReportPath(cwd, filePath));
}

function unique(entries: string[]): string[] {
  return [...new Set(entries)];
}

function configError(fieldPath: string, expectation: string): Error {
  return new Error(`Invalid env-doctor config at ${fieldPath}: ${expectation}.`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

import path from 'node:path';
import { stat } from 'node:fs/promises';

import fastGlob from 'fast-glob';

import type { ResolvedConfig } from './types.js';

export async function discoverEnvFiles(config: ResolvedConfig): Promise<string[]> {
  if (config.envFilesExplicit) {
    return uniqueSorted(config.envFiles);
  }

  const patterns = config.envFileNames.map((fileName) => `**/${fileName}`);
  return discoverFiles(config, patterns);
}

export async function discoverSourceFiles(config: ResolvedConfig): Promise<string[]> {
  if (config.sourcePathsExplicit) {
    const patterns = await Promise.all(config.sourcePaths.map((sourcePath) => sourcePathToGlob(config, sourcePath)));
    return discoverFiles(config, patterns);
  }

  const extensionPattern = config.sourceExtensions.map((extension) => extension.slice(1)).join(',');
  return discoverFiles(config, [`**/*.{${extensionPattern}}`]);
}

async function discoverFiles(config: ResolvedConfig, patterns: string[]): Promise<string[]> {
  const entries = await fastGlob(patterns, {
    absolute: true,
    cwd: config.cwd,
    dot: true,
    followSymbolicLinks: false,
    ignore: config.ignore,
    onlyFiles: true,
    unique: true
  });

  return uniqueSorted(entries.map((entry) => path.resolve(entry)));
}

function uniqueSorted(entries: string[]): string[] {
  return [...new Set(entries)].sort((left, right) => left.localeCompare(right));
}

async function sourcePathToGlob(config: ResolvedConfig, sourcePath: string): Promise<string> {
  const relative = absolutePathToGlob(config.cwd, sourcePath);
  const sourceStat = await stat(sourcePath);
  if (sourceStat.isDirectory()) {
    const extensionPattern = config.sourceExtensions.map((extension) => extension.slice(1)).join(',');
    return relative === '' ? `**/*.{${extensionPattern}}` : `${relative}/**/*.{${extensionPattern}}`;
  }

  return relative;
}

function absolutePathToGlob(cwd: string, sourcePath: string): string {
  const relative = path.relative(cwd, sourcePath).split(path.sep).join('/');
  if (relative === '') {
    return '';
  }

  return relative;
}

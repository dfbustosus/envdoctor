#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { scanProject } from './scanner.js';
import { renderHuman } from './reporters/human.js';
import { renderJson, renderJsonError } from './reporters/json.js';
import { escapeHumanText } from './text.js';
import type { FindingCategory, OutputFormat, ScanOptions } from './types.js';
import { getToolMetadata } from './version.js';

interface CliIo {
  stdout: Pick<NodeJS.WriteStream, 'write'>;
  stderr: Pick<NodeJS.WriteStream, 'write'>;
}

interface ParsedArgs {
  command?: string;
  help: boolean;
  version: boolean;
  options: ScanOptions;
}

const FINDING_CATEGORIES: FindingCategory[] = ['unused', 'missing', 'contract', 'duplicated', 'exposed-secret'];

export async function runCli(argv = process.argv.slice(2), io: CliIo = { stdout: process.stdout, stderr: process.stderr }): Promise<number> {
  let parsed: ParsedArgs;
  try {
    parsed = parseArgs(argv);
  } catch (error) {
    io.stderr.write(`env-doctor: ${escapeHumanText(error instanceof Error ? error.message : 'Invalid command line arguments.')}\n`);
    io.stderr.write('Run env-doctor --help for usage.\n');
    return 2;
  }

  if (parsed.version) {
    io.stdout.write(`${getPackageVersion()}\n`);
    return 0;
  }

  if (parsed.help || parsed.command === undefined) {
    io.stdout.write(`${helpText()}\n`);
    return 0;
  }

  if (parsed.command !== 'scan') {
    io.stderr.write(`env-doctor: unknown command "${escapeHumanText(parsed.command)}"\n`);
    io.stderr.write('Run env-doctor --help for usage.\n');
    return 2;
  }

  try {
    const result = await scanProject(parsed.options);
    const format = parsed.options.format ?? 'human';
    const output = format === 'json' ? renderJson(result) : renderHuman(result, parsed.options.verbose === undefined ? {} : { verbose: parsed.options.verbose });
    io.stdout.write(`${output}\n`);
    return result.suggestedExitCode;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected scanner failure.';
    if (parsed.options.format === 'json') {
      const requestedCwd = path.resolve(parsed.options.cwd ?? process.cwd());
      io.stdout.write(`${renderJsonError(message, {
        cwd: requestedCwd,
        ...(parsed.options.configFile === undefined ? {} : { configFile: normalizeConfigPath(requestedCwd, parsed.options.configFile) })
      })}\n`);
    } else {
      io.stderr.write(`env-doctor: ${escapeHumanText(message)}\n`);
    }
    return 2;
  }
}

function parseArgs(argv: string[]): ParsedArgs {
  const options: ScanOptions = {};
  const envFiles: string[] = [];
  const sourcePaths: string[] = [];
  const ignore: string[] = [];
  const publicPrefixes: string[] = [];
  let command: string | undefined;
  let help = false;
  let version = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) {
      continue;
    }

    if (!arg.startsWith('-') && command === undefined) {
      command = arg;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }

    if (arg === '--version' || arg === '-v') {
      version = true;
      continue;
    }

    if (arg === '--json') {
      options.format = 'json';
      continue;
    }

    if (arg === '--ci') {
      options.ci = true;
      continue;
    }

    if (arg === '--no-ci') {
      options.ci = false;
      continue;
    }

    if (arg === '--verbose') {
      options.verbose = true;
      continue;
    }

    if (arg === '--no-fail') {
      options.failOn = [];
      continue;
    }

    const option = readOptionValue(argv, index);
    if (option !== undefined) {
      index = option.nextIndex;
      switch (option.name) {
        case '--cwd':
          options.cwd = option.value;
          break;
        case '--config':
          options.configFile = option.value;
          break;
        case '--env-file':
          envFiles.push(option.value);
          break;
        case '--source':
          sourcePaths.push(option.value);
          break;
        case '--ignore':
          ignore.push(option.value);
          break;
        case '--public-prefix':
          publicPrefixes.push(option.value);
          break;
        case '--fail-on':
          options.failOn = parseFailOn(option.value);
          break;
        case '--format':
          options.format = parseFormat(option.value);
          break;
        default:
          throw new Error(`Unknown option ${option.name}.`);
      }
      continue;
    }

    throw new Error(`Unknown argument ${arg}.`);
  }

  if (envFiles.length > 0) {
    options.envFiles = envFiles;
  }

  if (sourcePaths.length > 0) {
    options.sourcePaths = sourcePaths;
  }

  if (ignore.length > 0) {
    options.ignore = ignore;
  }

  if (publicPrefixes.length > 0) {
    options.publicPrefixes = publicPrefixes;
  }

  return { ...(command === undefined ? {} : { command }), help, options, version };
}

function readOptionValue(argv: string[], index: number): { name: string; value: string; nextIndex: number } | undefined {
  const arg = argv[index];
  if (arg === undefined || !arg.startsWith('--')) {
    return undefined;
  }

  const equalsIndex = arg.indexOf('=');
  if (equalsIndex !== -1) {
    return {
      name: arg.slice(0, equalsIndex),
      nextIndex: index,
      value: arg.slice(equalsIndex + 1)
    };
  }

  const valueOptions = new Set(['--cwd', '--config', '--env-file', '--source', '--ignore', '--public-prefix', '--fail-on', '--format']);
  if (!valueOptions.has(arg)) {
    return undefined;
  }

  const value = argv[index + 1];
  if (value === undefined || value.startsWith('-')) {
    throw new Error(`${arg} requires a value.`);
  }

  return { name: arg, nextIndex: index + 1, value };
}

function parseFailOn(value: string): FindingCategory[] {
  if (value === 'none') {
    return [];
  }

  const categories = value.split(',').map((entry) => entry.trim()).filter(Boolean);
  for (const category of categories) {
    if (!FINDING_CATEGORIES.includes(category as FindingCategory)) {
      throw new Error(`Unsupported --fail-on category "${category}".`);
    }
  }

  return categories as FindingCategory[];
}

function parseFormat(value: string): OutputFormat {
  if (value === 'human' || value === 'json') {
    return value;
  }

  throw new Error('--format must be "human" or "json".');
}

function helpText(): string {
  return `env-doctor\n\nUsage:\n  env-doctor scan [options]\n\nOptions:\n  --json                         Print machine-readable JSON output\n  --format <human|json>           Select output format\n  --ci                           Fail on CI-risk categories: missing, contract, duplicated, exposed-secret\n  --no-ci                        Disable CI policy from project configuration\n  --cwd <path>                    Scan a different working directory\n  --config <path>                 Use an explicit JSON config file\n  --env-file <path>               Scan a specific env file; repeatable\n  --source <path>                 Scan a specific source file or directory; repeatable\n  --ignore <glob>                 Add an ignore glob; repeatable\n  --public-prefix <prefix>        Add public client env prefix; repeatable\n  --fail-on <list|none>           Comma-separated categories that produce exit code 1\n  --no-fail                       Always exit 0 unless a scan error occurs\n  --verbose                       Include scanned files and suppression details\n  --version                       Print version\n  --help                          Print help\n\nFinding categories:\n  ${FINDING_CATEGORIES.join(', ')}`;
}

function getPackageVersion(): string {
  return getToolMetadata().version;
}

function normalizeConfigPath(cwd: string, configFile: string): string {
  const absolute = path.isAbsolute(configFile) ? path.normalize(configFile) : path.resolve(cwd, configFile);
  const relative = path.relative(cwd, absolute);
  return (relative === '' ? '.' : relative).split(path.sep).join('/');
}

if (isMainModule()) {
  runCli().then((exitCode) => {
    process.exitCode = exitCode;
  }, (error: unknown) => {
    process.stderr.write(`env-doctor: ${escapeHumanText(error instanceof Error ? error.message : 'Unexpected CLI failure.')}\n`);
    process.exitCode = 2;
  });
}

function isMainModule(): boolean {
  if (process.argv[1] === undefined) {
    return false;
  }

  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

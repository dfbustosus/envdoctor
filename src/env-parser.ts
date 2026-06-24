import { readFile } from 'node:fs/promises';

import { parse as parseDotenv } from 'dotenv';

import type { ParsedEnvDefinition, ParsedEnvFile } from './internal-types.js';

type Quote = '"' | "'" | '`';

const ENV_ASSIGNMENT_PATTERN = /^\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)/u;

export async function parseEnvFile(filePath: string): Promise<ParsedEnvFile> {
  const content = await readFile(filePath, 'utf8');
  return parseEnvContent(filePath, content);
}

export function parseEnvContent(filePath: string, content: string): ParsedEnvFile {
  const definitions: ParsedEnvDefinition[] = [];
  const issues: ParsedEnvFile['issues'] = [];
  const lines = content.replace(/^\uFEFF/u, '').split(/\r?\n/u);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const trimmed = line.trim();
    const lineNumber = index + 1;

    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }

    const match = ENV_ASSIGNMENT_PATTERN.exec(line);
    if (!match) {
      issues.push({
        filePath,
        line: lineNumber,
        message: 'Line is not a valid dotenv assignment.'
      });
      continue;
    }

    const key = match[1];
    if (key === undefined) {
      issues.push({
        filePath,
        line: lineNumber,
        message: 'Line is not a valid dotenv assignment.'
      });
      continue;
    }

    const logicalEntry = collectLogicalEntry(lines, index);
    if (logicalEntry.unclosedQuote) {
      issues.push({
        filePath,
        line: lineNumber,
        message: 'Unterminated quoted dotenv value.'
      });
      continue;
    }

    index = logicalEntry.endIndex;

    const parsed = parseDotenv(logicalEntry.text);
    const value = parsed[key];

    if (value === undefined) {
      issues.push({
        filePath,
        line: lineNumber,
        message: 'Unable to parse dotenv value.'
      });
      continue;
    }

    definitions.push({
      filePath,
      key,
      line: lineNumber,
      value
    });
  }

  return { filePath, definitions, issues };
}

function collectLogicalEntry(lines: string[], startIndex: number): { text: string; endIndex: number; unclosedQuote: boolean } {
  const collected = [lines[startIndex] ?? ''];
  const quote = firstUnclosedQuote(collected[0] ?? '');
  if (quote === undefined) {
    return { text: collected.join('\n'), endIndex: startIndex, unclosedQuote: false };
  }

  let endIndex = startIndex;
  let closed = false;
  while (endIndex + 1 < lines.length) {
    endIndex += 1;
    collected.push(lines[endIndex] ?? '');
    if (closesQuote(collected[collected.length - 1] ?? '', quote)) {
      closed = true;
      break;
    }
  }

  return { text: collected.join('\n'), endIndex: closed ? endIndex : startIndex, unclosedQuote: !closed };
}

function firstUnclosedQuote(line: string): Quote | undefined {
  const assignment = ENV_ASSIGNMENT_PATTERN.exec(line);
  if (assignment === null) {
    return undefined;
  }

  const value = line.slice(assignment[0].length).trimStart();
  const first = value[0];
  if (first !== '"' && first !== "'" && first !== '`') {
    return undefined;
  }

  return closesQuote(value.slice(1), first) ? undefined : first;
}

function closesQuote(value: string, quote: Quote): boolean {
  let escaped = false;

  for (const character of value) {
    if (escaped) {
      escaped = false;
      continue;
    }

    if (character === '\\' && quote !== "'") {
      escaped = true;
      continue;
    }

    if (character === quote) {
      return true;
    }
  }

  return false;
}

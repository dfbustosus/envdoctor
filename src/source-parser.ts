import { readFile, stat } from 'node:fs/promises';

import { parse, type ParserPlugin } from '@babel/parser';

import type { DynamicEnvUsage, EnvUsage, ScanIssue, SourceLocation } from './types.js';

type NodeRecord = Record<string, unknown> & {
  type: string;
  loc?: {
    start?: {
      line?: number;
      column?: number;
    };
  } | null;
};

export interface ParsedSourceFile {
  filePath: string;
  usages: EnvUsage[];
  dynamicUsages: DynamicEnvUsage[];
  issues: ScanIssue[];
}

const PARSER_PLUGINS: ParserPlugin[] = [
  'typescript',
  'jsx',
  'decorators-legacy',
  'classProperties',
  'classPrivateProperties',
  'classPrivateMethods',
  'dynamicImport',
  'importMeta',
  'topLevelAwait'
];

export async function parseSourceFile(filePath: string, maxFileSizeBytes: number): Promise<ParsedSourceFile> {
  const fileStat = await stat(filePath);
  if (fileStat.size > maxFileSizeBytes) {
    return {
      filePath,
      usages: [],
      dynamicUsages: [],
      issues: [
        {
          filePath,
          kind: 'file-read-error',
          message: `File exceeds the ${maxFileSizeBytes} byte scan limit.`
        }
      ]
    };
  }

  const source = await readFile(filePath, 'utf8');
  return parseSourceContent(filePath, source);
}

export function parseSourceContent(filePath: string, source: string): ParsedSourceFile {
  const usages: EnvUsage[] = [];
  const dynamicUsages: DynamicEnvUsage[] = [];
  const issues: ScanIssue[] = [];

  let ast: unknown;
  try {
    ast = parse(source, {
      allowImportExportEverywhere: true,
      errorRecovery: true,
      plugins: PARSER_PLUGINS,
      sourceType: 'unambiguous'
    });
  } catch (error) {
    return {
      filePath,
      usages,
      dynamicUsages,
      issues: [
        {
          filePath,
          kind: 'source-parse-error',
          message: error instanceof Error ? error.message : 'Unable to parse source file.'
        }
      ]
    };
  }

  issues.push(...collectRecoveredParseErrors(filePath, ast));

  walk(ast, (node) => {
    collectMemberUsage(filePath, node, usages, dynamicUsages);
    collectDestructuredUsage(filePath, node, usages, dynamicUsages);
  });

  return { filePath, usages, dynamicUsages, issues };
}

function collectRecoveredParseErrors(filePath: string, ast: unknown): ScanIssue[] {
  if (typeof ast !== 'object' || ast === null) {
    return [];
  }

  const errors = (ast as { errors?: unknown }).errors;
  if (!Array.isArray(errors)) {
    return [];
  }

  return errors.map((error): ScanIssue => {
    const maybeError = error as { message?: unknown; loc?: { line?: unknown; column?: unknown } };
    const line = typeof maybeError.loc?.line === 'number' ? maybeError.loc.line : undefined;
    const column = typeof maybeError.loc?.column === 'number' ? maybeError.loc.column + 1 : undefined;
    return {
      filePath,
      kind: 'source-parse-error',
      message: typeof maybeError.message === 'string' ? maybeError.message : 'Source parser recovered from a syntax error.',
      ...(line === undefined ? {} : { line }),
      ...(column === undefined ? {} : { column })
    };
  });
}

function collectMemberUsage(
  filePath: string,
  node: NodeRecord,
  usages: EnvUsage[],
  dynamicUsages: DynamicEnvUsage[]
): void {
  if (!isMemberExpression(node)) {
    return;
  }

  const object = getNode(node, 'object');
  const envObject = getEnvObjectKind(object);
  if (envObject === undefined) {
    return;
  }

  const computed = getBoolean(node, 'computed');
  const property = getNode(node, 'property');
  const key = getStaticPropertyName(property, computed);

  if (key !== undefined) {
    usages.push({
      ...location(filePath, node),
      key,
      syntax: envObject === 'process' ? (computed ? 'process-env-bracket' : 'process-env-dot') : computed ? 'import-meta-env-bracket' : 'import-meta-env-dot'
    });
    return;
  }

  if (computed) {
    dynamicUsages.push({
      ...location(filePath, node),
      reason: 'Environment variable key is computed dynamically.',
      syntax: envObject === 'process' ? 'process-env-dynamic' : 'import-meta-env-dynamic'
    });
  }
}

function collectDestructuredUsage(
  filePath: string,
  node: NodeRecord,
  usages: EnvUsage[],
  dynamicUsages: DynamicEnvUsage[]
): void {
  if (node.type !== 'VariableDeclarator') {
    return;
  }

  const id = getNode(node, 'id');
  const init = getNode(node, 'init');
  const envObject = getEnvObjectKind(init);

  if (id?.type !== 'ObjectPattern' || envObject === undefined) {
    return;
  }

  const properties = getArray(id, 'properties');
  for (const property of properties) {
    if (!isNode(property)) {
      continue;
    }

    if (property.type === 'RestElement') {
      dynamicUsages.push({
        ...location(filePath, property),
        reason: 'Rest destructuring from environment variables is dynamic.',
        syntax: envObject === 'process' ? 'process-env-dynamic' : 'import-meta-env-dynamic'
      });
      continue;
    }

    if (property.type !== 'ObjectProperty' && property.type !== 'Property') {
      continue;
    }

    const keyNode = getNode(property, 'key');
    const computed = getBoolean(property, 'computed');
    const key = getStaticPropertyName(keyNode, computed);

    if (key === undefined) {
      dynamicUsages.push({
        ...location(filePath, property),
        reason: 'Destructured environment variable key is computed dynamically.',
        syntax: envObject === 'process' ? 'process-env-dynamic' : 'import-meta-env-dynamic'
      });
      continue;
    }

    usages.push({
      ...location(filePath, property),
      key,
      syntax: envObject === 'process' ? 'process-env-destructure' : 'import-meta-env-destructure'
    });
  }
}

function getEnvObjectKind(node: NodeRecord | undefined): 'process' | 'import-meta' | undefined {
  if (isProcessEnvObject(node)) {
    return 'process';
  }

  if (isImportMetaEnvObject(node)) {
    return 'import-meta';
  }

  return undefined;
}

function isProcessEnvObject(node: NodeRecord | undefined): boolean {
  if (!isMemberExpression(node)) {
    return false;
  }

  const object = getNode(node, 'object');
  const property = getNode(node, 'property');
  return object?.type === 'Identifier' && getString(object, 'name') === 'process' && property?.type === 'Identifier' && getString(property, 'name') === 'env';
}

function isImportMetaEnvObject(node: NodeRecord | undefined): boolean {
  if (!isMemberExpression(node)) {
    return false;
  }

  const object = getNode(node, 'object');
  const property = getNode(node, 'property');
  return isImportMeta(object) && property?.type === 'Identifier' && getString(property, 'name') === 'env';
}

function isImportMeta(node: NodeRecord | undefined): boolean {
  if (node?.type !== 'MetaProperty') {
    return false;
  }

  const meta = getNode(node, 'meta');
  const property = getNode(node, 'property');
  return meta?.type === 'Identifier' && getString(meta, 'name') === 'import' && property?.type === 'Identifier' && getString(property, 'name') === 'meta';
}

function getStaticPropertyName(node: NodeRecord | undefined, computed: boolean): string | undefined {
  if (node === undefined) {
    return undefined;
  }

  if (!computed && node.type === 'Identifier') {
    return getString(node, 'name');
  }

  if (node.type === 'StringLiteral') {
    return getString(node, 'value');
  }

  if (node.type === 'TemplateLiteral') {
    const expressions = getArray(node, 'expressions');
    const quasis = getArray(node, 'quasis');
    const firstQuasi = quasis[0];
    if (expressions.length === 0 && isNode(firstQuasi)) {
      const value = getRecord(firstQuasi, 'value');
      return getString(value, 'cooked') ?? getString(value, 'raw');
    }
  }

  return undefined;
}

function isMemberExpression(node: NodeRecord | undefined): node is NodeRecord {
  return node?.type === 'MemberExpression' || node?.type === 'OptionalMemberExpression';
}

function location(filePath: string, node: NodeRecord): SourceLocation {
  const start = node.loc?.start;
  return {
    filePath,
    ...(typeof start?.line === 'number' ? { line: start.line } : {}),
    ...(typeof start?.column === 'number' ? { column: start.column + 1 } : {})
  };
}

function walk(value: unknown, visit: (node: NodeRecord) => void): void {
  if (!isNode(value)) {
    return;
  }

  visit(value);

  for (const [key, child] of Object.entries(value)) {
    if (shouldSkipChildKey(key)) {
      continue;
    }

    if (Array.isArray(child)) {
      for (const item of child) {
        walk(item, visit);
      }
      continue;
    }

    walk(child, visit);
  }
}

function shouldSkipChildKey(key: string): boolean {
  return key === 'loc' || key === 'start' || key === 'end' || key === 'extra' || key === 'leadingComments' || key === 'trailingComments' || key === 'innerComments';
}

function isNode(value: unknown): value is NodeRecord {
  return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string';
}

function getNode(node: NodeRecord | undefined, key: string): NodeRecord | undefined {
  if (node === undefined) {
    return undefined;
  }

  const value = node[key];
  return isNode(value) ? value : undefined;
}

function getArray(node: NodeRecord, key: string): unknown[] {
  const value = node[key];
  return Array.isArray(value) ? value : [];
}

function getString(node: Record<string, unknown> | undefined, key: string): string | undefined {
  if (node === undefined) {
    return undefined;
  }

  const value = node[key];
  return typeof value === 'string' ? value : undefined;
}

function getRecord(node: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = node[key];
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function getBoolean(node: NodeRecord, key: string): boolean {
  const value = node[key];
  return value === true;
}

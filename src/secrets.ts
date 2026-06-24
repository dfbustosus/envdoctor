import path from 'node:path';

import type { ParsedEnvDefinition } from './internal-types.js';
import type { SecretRiskReasonCode } from './types.js';

const SECRET_KEY_PATTERN = /(?:^|[_-])(?:SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE[_-]?KEY|API[_-]?KEY|AUTH|CREDENTIAL|SESSION)(?:[_-]|$)/iu;

const TOKEN_VALUE_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
  /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9_-]{8,}\b/u,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/u,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/u,
  /\bfake_live_token_[A-Za-z0-9_-]+\b/iu,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/u,
  /\b[A-Fa-f0-9]{32,}\b/u
] as const;

const PLACEHOLDER_VALUE_PATTERN = /^(?:|example|sample|change[_-]?me|replace[_-]?me|your[_-].*|<.*>|\$\{.*\})$/iu;

export interface SecretRisk {
  isRisk: boolean;
  reasonCodes: SecretRiskReasonCode[];
  reasons: string[];
}

export function evaluateSecretRisk(definition: ParsedEnvDefinition, publicPrefixes: string[]): SecretRisk {
  const reasonCodes: SecretRiskReasonCode[] = [];
  const publicPrefix = publicPrefixes.find((prefix) => definition.key.startsWith(prefix));
  const secretLikeName = isSecretLikeKey(definition.key);
  const secretLikeValue = isSecretLikeValue(definition.value);
  const exampleFile = path.basename(definition.filePath) === '.env.example';
  const placeholder = isPlaceholderValue(definition.value);

  if (publicPrefix !== undefined && secretLikeName) {
    reasonCodes.push('PUBLIC_PREFIX_WITH_SECRET_NAME');
  }

  if (publicPrefix !== undefined && secretLikeValue) {
    reasonCodes.push('PUBLIC_PREFIX_WITH_SECRET_VALUE');
  }

  if (secretLikeValue && !placeholder) {
    reasonCodes.push('SECRET_LIKE_VALUE');
  }

  if (secretLikeName && secretLikeValue && !placeholder) {
    reasonCodes.push('SECRET_NAME_WITH_SECRET_VALUE');
  }

  if (exampleFile && secretLikeValue && !placeholder) {
    reasonCodes.push('EXAMPLE_FILE_SECRET_VALUE');
  }

  const uniqueReasonCodes = [...new Set(reasonCodes)];

  return {
    isRisk: uniqueReasonCodes.length > 0,
    reasonCodes: uniqueReasonCodes,
    reasons: uniqueReasonCodes.map((reasonCode) => formatSecretRiskReason(reasonCode, publicPrefix))
  };
}

export function isSecretLikeKey(key: string): boolean {
  return SECRET_KEY_PATTERN.test(key);
}

export function isSecretLikeValue(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === '' || isPlaceholderValue(trimmed)) {
    return false;
  }

  return TOKEN_VALUE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function isPlaceholderValue(value: string): boolean {
  return PLACEHOLDER_VALUE_PATTERN.test(value.trim());
}

function formatSecretRiskReason(reasonCode: SecretRiskReasonCode, publicPrefix: string | undefined): string {
  switch (reasonCode) {
    case 'PUBLIC_PREFIX_WITH_SECRET_NAME':
      return `Key uses public prefix ${publicPrefix ?? 'PUBLIC_'} and has a secret-like name.`;
    case 'PUBLIC_PREFIX_WITH_SECRET_VALUE':
      return `Key uses public prefix ${publicPrefix ?? 'PUBLIC_'} and has a secret-like value.`;
    case 'SECRET_LIKE_VALUE':
      return 'Value looks like secret material.';
    case 'SECRET_NAME_WITH_SECRET_VALUE':
      return 'Secret-like key name is paired with a secret-like value.';
    case 'EXAMPLE_FILE_SECRET_VALUE':
      return 'Example env file contains a secret-like value.';
  }
}

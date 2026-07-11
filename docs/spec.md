# env-doctor Baseline Specification

## Outcomes

Developers can install `env-doctor`, run `env-doctor scan`, and receive an actionable report of dotenv health: used variables, unused definitions, missing definitions, `.env.example` contract drift, duplicates, and exposed secret risks. Reports are safe for terminals and CI because raw env values are never printed.

## Scope boundaries

In scope for the baseline: the `scan` command, dotenv file discovery, JS/TS static usage detection, same-file duplicate detection, `.env.example` contract checks, missing/unused classification, conservative secret exposure heuristics, validated project configuration, reason-required suppressions, human output, versioned JSON output, deterministic exit codes, tests, CI, and npm package metadata.

Out of scope for the baseline: automatic fixes, runtime production validation, deployment-provider secret reads, encrypted secret stores, framework-specific deep integrations, telemetry, web UI, and non-JS/TS language scanning.

## Constraints and assumptions

- The package targets npm with the binary name `env-doctor`.
- TypeScript source emits ESM-compatible package output.
- The scanner core stays independent from CLI rendering.
- Dotenv parsing must preserve duplicate definitions and line locations.
- Source scanning must use AST parsing for core JS/TS behavior.
- Dynamic env usage is uncertainty metadata, not guessed usage.
- Secret diagnostics must not include raw values.
- JSON output is a versioned public contract with stable finding codes and confidence levels.
- `.env-doctor.json` is discovered only in the effective scan cwd; explicit `--config` replaces automatic discovery.
- Configuration is validated as untrusted input and invalid configuration is exit code `2` even under non-failing policy.
- Suppressions require an exact finding code, key, reason, and optional cwd-relative file path. File-scoped rules suppress only matching locations.
- Existing `findings` and category totals remain detected-finding contracts; active findings, suppressed records, and explicitly named disposition units are additive report-v1 fields.

## Prior decisions

- Default env files: `.env`, `.env.local`, `.env.prod`, `.env.stage`, `.env.example`.
- Default source extensions: JS, JSX, TS, TSX, MJS, CJS, MTS, CTS.
- Default public prefixes: `NEXT_PUBLIC_`, `VITE_`, `PUBLIC_`.
- Exit code categories: clean `0`, findings `1`, scan error `2`; local scans do not fail on findings unless `--ci` or `--fail-on` is used.
- Public API: scanner entrypoint, config loader, report types, finding types, and reporter helpers.
- Configuration precedence: built-in defaults, project JSON, then explicit CLI/library options. Empty arrays and `false` are intentional overrides.

## Task breakdown

1. Package baseline: package metadata, TypeScript build, exports, bin, npm file allowlist, CI.
2. Discovery: env files, source files, default ignores, explicit overrides.
3. Parsing: dotenv definitions with line locations and AST source usage detection.
4. Analysis: used, unused, missing, `.env.example` contract, duplicated, exposed-secret findings.
5. Disposition: partition findings into active and reason-suppressed locations before exit policy.
6. Reporting: compact human output and stable versioned JSON output with suppression audit data.
7. Verification: unit tests, CLI fixture tests, schema validation, typecheck, lint, build, and npm pack dry run.

## Verification criteria

- `env-doctor scan` works with no config in a JS/TS fixture project.
- Findings are deterministic and include key, reason, file, and location.
- Empty dotenv values, quoted values, comments, duplicates, destructuring, bracket access, and dynamic access are tested.
- JSON output is parseable and contains no raw env values.
- JSON output includes `reportVersion`, `schema`, `tool`, stable finding `code`, `confidence`, and `exitCode`.
- Automatic and explicit config loading, strict validation, CLI precedence, exact suppression matching, path-scoped partial suppression, and exit policy are tested.
- Suppressed secret findings and hostile suppression text cannot leak raw values or terminal control characters.
- Human output is compact and actionable.
- Release gates pass: typecheck, lint, tests, build, and `npm pack --dry-run`.

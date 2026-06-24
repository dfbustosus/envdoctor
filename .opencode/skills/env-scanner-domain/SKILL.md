---
name: env-scanner-domain
description: Design and validate dotenv scanning behavior for missing, unused, duplicated, and exposed secret variables in JavaScript and TypeScript repositories.
license: MIT
compatibility: opencode
metadata:
  audience: implementers
  workflow: scanner-design
---

## Purpose

Use this skill when designing or implementing `env-doctor scan` behavior.

## Required Finding Types

- `used`: variable is referenced by source code.
- `unused`: variable is defined in scanned env files but not referenced by source code.
- `missing`: variable is referenced by source code but not defined in the selected env files or example file.
- `duplicated`: variable is defined more than once in the same env file or across files where the active scan policy considers that ambiguous.
- `exposed-secret`: variable name or value looks secret and is placed in a public client prefix, committed example, or otherwise unsafe context.

## Scanner Rules

- Parse dotenv syntax with a parser that supports comments, quoted values, escaped values, and empty assignments.
- Parse JavaScript and TypeScript source through AST tooling for core detection.
- Detect at least these static usage forms:
  - `process.env.NAME`
  - `process.env["NAME"]`
  - `process.env['NAME']`
  - destructuring from `process.env` when the key is statically known
- Mark dynamic usage such as `process.env[key]` as unknown usage metadata instead of pretending it is exhaustive.
- Ignore generated output, dependency directories, VCS directories, and configured ignore globs.
- Keep framework-specific public prefixes configurable.

## Secret Heuristics

- Combine key-name patterns and value heuristics. Do not rely on only one signal.
- High-risk key tokens include `SECRET`, `TOKEN`, `PASSWORD`, `PRIVATE_KEY`, `API_KEY`, `AUTH`, `CREDENTIAL`, and `SESSION`.
- Treat public prefixes such as `NEXT_PUBLIC_`, `VITE_`, and `PUBLIC_` as exposure contexts when paired with secret-like names or values.
- Never print full values. Prefer key name, file path, line number, reason, and redacted preview.

## Output Contract

Default human output should be compact:

```text
env-doctor scan

OK 32 variables used

WARN 5 unused
WARN 2 missing
WARN 1 exposed secret
WARN 3 duplicated
```

JSON output should include machine-readable findings, totals, config metadata, scanned files, and exit-code category.

## Exit Code Guidance

- `0`: no warnings or errors.
- `1`: findings should fail CI under the selected policy.
- `2`: scanner configuration or runtime error.

Keep exit-code policy configurable because local development and CI have different tolerance.

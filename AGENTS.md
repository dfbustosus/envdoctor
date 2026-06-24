# envdoctor Agent Instructions

## Mission

Build `env-doctor` as a public npm package and CLI that helps developers understand the health of dotenv-style configuration across application repositories.

The primary command target is:

```sh
env-doctor scan
```

The default scan should report:

- variables used in source code
- variables defined but unused
- variables used but missing from the selected env files
- duplicated variable definitions
- secret-looking values or exposed secret-looking public variables

The CLI should be useful with common files such as `.env`, `.env.local`, `.env.prod`, `.env.stage`, and `.env.example`.

## Product Principles

- Prefer a fast, deterministic CLI over a broad but vague analyzer.
- Treat secrets conservatively: never print raw secret values, only file, key, reason, and safe redacted previews when needed.
- Make defaults work for JavaScript and TypeScript projects, then keep extension points explicit.
- Keep output human-readable by default and provide structured JSON output for CI.
- Avoid requiring a framework-specific config file for the first useful scan.

## Package Standards

- Target package name: `env-doctor` unless npm availability forces a documented alternative.
- Target binary name: `env-doctor`.
- Use TypeScript for source.
- Prefer ESM-compatible packaging with explicit `exports` and `bin` entries.
- Keep public API surface small: CLI entrypoint, scanner API, config loading API, and report types.
- Support current active LTS Node.js versions unless the package implementation has a documented reason not to.
- Do not publish generated artifacts, local env files, coverage output, or editor metadata.

## Architecture Expectations

- Parse dotenv files with a real dotenv parser.
- Parse source usage with AST tooling where practical. Avoid brittle regex-only scanning for core behavior.
- Keep the scanner core independent from CLI rendering.
- Model scan findings with typed result objects before formatting them.
- Separate discovery, parsing, analysis, reporting, and exit-code policy.
- Make framework-specific public env rules configurable. Include sensible built-in defaults for common prefixes like `NEXT_PUBLIC_`, `VITE_`, and `PUBLIC_`.

## Testing Expectations

- Unit-test env file parsing, duplicate detection, usage detection, missing/unused classification, and secret heuristics.
- Add CLI integration tests using temporary fixture projects.
- Use fake secret fixtures only. Never add real tokens or realistic private credentials.
- Test JSON output and human output separately.
- Treat typecheck, lint, tests, and `npm pack --dry-run` as the minimum release gate.

## Security Expectations

- Never log full env values.
- Never copy values from ignored `.env*` files into tracked files.
- Use fixtures with clearly fake values such as `fake_live_token_123`.
- Redact any value-like content found in diagnostics.
- Consider public client prefixes a possible exposure path when the variable name or value looks secret.

## Collaboration Rules

- Start with a short plan for multi-step changes.
- Use specialist agents for focused work and keep the orchestrator responsible for final integration.
- Reviewers must report concrete risks, file paths, and test gaps.
- Do not implement broad rewrites unless the roadmap calls for them.
- Preserve unrelated user changes.

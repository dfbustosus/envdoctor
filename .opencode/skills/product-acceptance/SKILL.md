---
name: product-acceptance
description: Validate that env-doctor delivers a clear developer experience, useful scan output, trustworthy warnings, and documentation fit for a public npm package.
license: MIT
compatibility: opencode
metadata:
  audience: product
  workflow: acceptance
---

## Purpose

Use this skill when reviewing user-facing behavior, README examples, CLI ergonomics, and release readiness.

## Acceptance Criteria

A first-time user should be able to:

- install the package
- run `env-doctor scan`
- understand the summary
- inspect detailed findings
- avoid leaking secret values
- use JSON output in CI

## CLI Experience

- The default command should be useful with no config.
- Warnings should explain what happened and point to affected files and keys.
- The summary should be compact.
- Detailed output should be available without overwhelming normal usage.
- JSON mode should be stable and documented.

## Documentation Criteria

README should include:

- what problem the tool solves
- install command
- quick start
- sample output
- supported env files
- supported source patterns
- CI example
- security and redaction behavior
- limitations

## Product Review Questions

- Would a developer trust this result enough to act on it?
- Is the warning actionable?
- Are limitations honest?
- Is the package easy to try in under five minutes?

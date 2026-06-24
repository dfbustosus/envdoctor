---
name: testing-quality-gates
description: Define and run quality gates for env-doctor across unit tests, CLI fixture tests, typecheck, lint, coverage, and package dry-run validation.
license: MIT
compatibility: opencode
metadata:
  audience: qa
  workflow: quality
---

## Purpose

Use this skill when adding tests, designing QA strategy, reviewing quality gates, or preparing a release.

## Minimum Gates

- Typecheck passes.
- Lint passes.
- Unit tests pass.
- CLI integration tests pass against fixture projects.
- `npm pack --dry-run` succeeds and package contents are expected.

## Critical Test Areas

- dotenv parsing with comments, quotes, empty values, duplicate keys, and multiple files.
- static source usage detection in JavaScript and TypeScript.
- dynamic source usage detection is surfaced as uncertainty.
- unused and missing classification is stable.
- exposed-secret heuristics redact values.
- CLI output remains readable.
- JSON output is parseable and stable enough for CI.

## Fixture Rules

- Use fake secrets only.
- Do not commit `.env` or `.env.*` fixture files unless the repository intentionally unignores a fixture path with fake values.
- Prefer fixture directories with names that make expected behavior obvious.
- Include line numbers in expected diagnostics when the implementation supports them.

## Review Questions

- Could this change produce false confidence in a CI scan?
- Could this change leak an env value?
- Does the test fail for the right reason?
- Is the fixture realistic enough to protect user workflows?

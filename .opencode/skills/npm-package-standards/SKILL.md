---
name: npm-package-standards
description: Apply public npm package best practices for env-doctor, including CLI bin metadata, exports, TypeScript builds, semantic versioning, and publish safety.
license: MIT
compatibility: opencode
metadata:
  audience: maintainers
  workflow: package-design
---

## Purpose

Use this skill when creating or reviewing package structure, package metadata, build scripts, release setup, or public API decisions.

## Package Checklist

- `package.json` includes `name`, `version`, `description`, `license`, `repository`, `homepage`, `bugs`, `keywords`, `engines`, `bin`, `exports`, `files`, and useful scripts.
- The CLI binary name is `env-doctor`.
- The source is TypeScript and emits declaration files for public library APIs.
- The package excludes tests, fixtures that are not needed at runtime, coverage, local env files, and editor metadata.
- `npm pack --dry-run` is part of the release checklist.
- README includes install, quick start, example output, JSON output, CI usage, and security notes.

## Public API Guidance

Keep the public API small and stable:

- scanner entrypoint
- config loading
- report types
- finding types
- reporter helpers only if they are intentionally public

Avoid exposing parser internals until a real extension use case exists.

## Dependency Guidance

- Choose dependencies that reduce correctness risk, especially for dotenv parsing and TypeScript AST analysis.
- Avoid heavy runtime dependencies for cosmetic CLI output.
- Pin or range dependencies according to the repository package manager policy once it exists.
- Document why any dependency with significant transitive weight is needed.

## Release Guidance

- Prefer semantic versioning from the first public release.
- Use npm provenance in GitHub Actions when publishing.
- Do not publish from a dirty worktree.
- Validate package contents before publishing.

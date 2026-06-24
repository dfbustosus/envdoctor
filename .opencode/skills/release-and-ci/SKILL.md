---
name: release-and-ci
description: Design secure GitHub Actions and npm release workflows for env-doctor, including test matrices, least privilege permissions, provenance, and dry-run validation.
license: MIT
compatibility: opencode
metadata:
  audience: maintainers
  workflow: ci-release
---

## Purpose

Use this skill when creating or reviewing CI, release, npm publishing, or contributor automation.

## CI Workflow

Run on pull requests and pushes to the default branch:

- install dependencies with the chosen package manager
- lint
- typecheck
- test
- build
- package dry run

Use a Node.js matrix that matches the documented engine support. Keep CI fast enough for outside contributors.

## Release Workflow

Release publishing should:

- run only from tags or a manual release dispatch
- use least-privilege GitHub permissions
- require all quality gates before publish
- use npm provenance where possible
- avoid echoing secrets
- validate package contents before publish

## Security Defaults

- `contents: read` for CI unless additional permissions are required.
- `id-token: write` only for workflows that need provenance or trusted publishing.
- Never use pull request workflows that expose npm publish secrets to untrusted code.

## Package Validation

Before publishing:

- confirm version and changelog or release notes
- run the complete quality gate
- run `npm pack --dry-run`
- inspect the package file list
- verify `bin` and `exports`

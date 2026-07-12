# Contributing to env-doctor

Thank you for improving `env-doctor`.

## Requirements

- Node.js 22.12 or later on the Node 22 line, or Node.js 24
- npm
- a clean checkout without local `.env*` files staged for commit

## Setup

```sh
npm ci
npm run verify
```

## Development workflow

1. Start from the latest `main` branch.
2. Keep changes focused on one behavior or release concern.
3. Update the owning tests and every affected public contract.
4. Use temporary fixtures containing obviously fake values only.
5. Run focused tests while iterating.
6. Run the complete gate before requesting review:

```sh
npm run ci
```

## Public contracts

Coordinate changes across these surfaces:

- CLI flags, output routing, and exit codes
- exports from `src/index.ts`
- report/finding types in `src/types.ts`
- `schemas/scan-report-v1.schema.json`
- documented defaults in `README.md`

Do not expose parser internals or raw env values. Removing or changing existing report fields requires an explicit report-version decision.

## Pull requests

Describe:

- user-visible behavior
- security and compatibility impact
- tests and commands actually run
- skipped gates or remaining risks

Publishing, version bumps, tags, and releases are maintainer operations and must not be included in ordinary contribution PRs.

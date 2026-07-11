# env-doctor

`env-doctor` is a CLI and small library for finding dotenv configuration drift before it reaches production.

It scans common files such as `.env`, `.env.local`, `.env.prod`, `.env.stage`, and `.env.example`, then reports variables that are used, unused, missing, duplicated, or risky to expose.

```sh
env-doctor scan
```

```text
env-doctor scan

OK 32 variables used

WARN 5 unused
WARN 2 missing
WARN 1 exposed secret
WARN 3 duplicated
```

## Install

```sh
npm install --save-dev env-doctor
```

You can also try it without installing:

```sh
npx env-doctor scan
```

## What it detects

- **Used variables** referenced in JavaScript or TypeScript source.
- **Unused variables** defined in scanned env files but not found in source usage.
- **Missing variables** used in source but absent from scanned env files.
- **Duplicated variables** defined more than once in the same scanned env file.
- **Exposed secret risks** where public client prefixes or example files contain secret-looking keys or values.

Secret diagnostics are conservative and value-safe: raw env values are not printed in human output or JSON output.

## Quick start

```sh
npx env-doctor scan
```

Useful options:

```sh
env-doctor scan --json
env-doctor scan --cwd ./apps/web
env-doctor scan --config ./config/env-doctor.json
env-doctor scan --env-file .env --env-file .env.example
env-doctor scan --source src --ignore "**/generated/**"
env-doctor scan --ci
env-doctor scan --fail-on missing,exposed-secret
env-doctor scan --no-fail
```

## Supported source patterns

The first release focuses on static JavaScript and TypeScript usage:

```js
process.env.API_URL;
process.env['API_URL'];
process.env["API_URL"];
const { API_URL } = process.env;

import.meta.env.VITE_API_URL;
import.meta.env['VITE_API_URL'];
const { VITE_API_URL } = import.meta.env;
```

Dynamic usage is reported as analysis uncertainty instead of being guessed:

```js
process.env[key];
```

## JSON output

Use JSON mode for CI or custom tooling:

```sh
env-doctor scan --json
```

The JSON report includes totals, findings, scanned files, source usages, dynamic usage warnings, configuration metadata, and the suggested exit code. It does not include raw env values.

JSON output is versioned with `reportVersion: 1`, stable finding `code` values, `confidence` levels, tool metadata, and a schema reference. The schema is published in this package at `schemas/scan-report-v1.schema.json`.

Example finding codes include:

- `ENV_MISSING`
- `ENV_EXAMPLE_MISSING_USED_KEY`
- `ENV_UNUSED`
- `ENV_DUPLICATED_SAME_FILE`
- `ENV_PUBLIC_SECRET`
- `ENV_EXAMPLE_SECRET_VALUE`
- `ENV_SECRET_LIKE_VALUE`

## Exit codes

- `0`: scan completed with no policy-failing findings.
- `1`: scan completed and found configured failure categories.
- `2`: scan could not complete because of configuration, parsing, or runtime errors.

By default, local scans report warnings without failing. Use `--ci` to fail on missing, contract, duplicated, and exposed-secret findings, or use `--fail-on` / `--no-fail` to define a custom policy.

## Project configuration and suppressions

`env-doctor` automatically loads `.env-doctor.json` from the effective scan directory. It does not search parent directories. Use `--config <path>` to select a different file; relative paths are resolved from `--cwd`.

```json
{
  "configVersion": 1,
  "ci": true,
  "failOn": ["missing", "contract", "duplicated", "exposed-secret"],
  "suppressions": [
    {
      "code": "ENV_MISSING",
      "key": "VERCEL_URL",
      "reason": "Injected by Vercel at runtime"
    },
    {
      "code": "ENV_MISSING",
      "key": "INTERNAL_URL",
      "filePath": "src/platform.ts",
      "reason": "Injected only for this deployment entrypoint"
    }
  ]
}
```

Every suppression requires an exact finding `code`, exact variable `key`, and non-empty `reason`. Matching is case-sensitive. An optional `filePath` limits suppression to that cwd-relative finding location; it does not hide matching locations in other files.

Suppression reasons are audit metadata and appear in JSON plus verbose human output. Write operational explanations only; never place credentials or env values in a reason.

Configuration is validated strictly. Unknown properties, unsupported codes, duplicate rules, malformed JSON, and missing reasons stop the scan with exit code `2`. `--no-fail` never hides configuration errors.

Explicit CLI or library options override config-file values. CLI `--ci` enforces the default CI categories even if the project config has a weaker policy; use an explicit `--fail-on` or `--no-fail` on that invocation to override it. `--no-ci` disables the config's CI default selection, but an explicit config `failOn` still applies until `--no-fail` is used.

JSON reports retain all detected findings in `findings`, expose unsuppressed findings in `activeFindings`, and provide auditable `suppressedFindings` with reasons. `findingTotals` reports detected finding records, active finding records, and suppressed locations without pretending those are interchangeable units. Human output shows a compact suppressed-location count; use `--verbose` for suppression details.

## `.env.example` contract checks

When `.env.example` exists, `env-doctor` treats it as contributor-facing documentation. It reports used variables that are missing from `.env.example` with `ENV_EXAMPLE_MISSING_USED_KEY`, and it reports secret-looking example values with `ENV_EXAMPLE_SECRET_VALUE`.

## CI example

```yaml
name: Env Doctor

on: [pull_request]

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx env-doctor scan --ci --json
```

## Public prefixes

The default public client prefixes are:

- `NEXT_PUBLIC_`
- `VITE_`
- `PUBLIC_`

Add more prefixes with:

```sh
env-doctor scan --public-prefix CLIENT_PUBLIC_
```

## Security behavior

- Raw env values are never rendered in reports.
- Secret heuristics combine key names, value shapes, public prefixes, and example-file context.
- Public-prefixed keys such as `NEXT_PUBLIC_API_SECRET` are treated as exposure risks.
- `.env.example` values that look like real tokens are treated as exposure risks.

## Limitations

`env-doctor` does not validate production runtime state. It reports what is present in selected dotenv files and statically detectable source usage.

The baseline intentionally does not support automatic fixes, cloud secret managers, encrypted env stores, or every programming language. Dynamic env access is surfaced as uncertainty because pretending to know those keys would create false confidence.

Selected env files currently form one repository-wide definition set, and discovered `.env.example` files form one repository-wide contract set. They are not interpreted as dotenv precedence layers or per-application environments.

## Library API

```ts
import { scanProject } from 'env-doctor';

const result = await scanProject({ cwd: process.cwd() });
console.log(result.totals);
```

The public API exports scanner, config, report, and finding types. Parser internals are intentionally not part of the package contract.

## Development

```sh
npm install
npm run typecheck
npm run lint
npm test
npm audit
npm run build
npm pack --dry-run
```

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
env-doctor scan --env-file .env --env-file .env.example
env-doctor scan --source src --ignore "**/generated/**"
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

## Exit codes

- `0`: scan completed with no policy-failing findings.
- `1`: scan completed and found configured failure categories.
- `2`: scan could not complete because of configuration, parsing, or runtime errors.

By default, all finding categories fail the command. Use `--fail-on` or `--no-fail` to adjust local or CI behavior.

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
      - run: npx env-doctor scan --json
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

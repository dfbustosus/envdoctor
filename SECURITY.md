# Security Policy

## Supported versions

Before the first stable release, security fixes are made on the latest published `0.x` line only. Users should upgrade to the newest available version.

## Reporting a vulnerability

Use GitHub private vulnerability reporting for this repository:

<https://github.com/dfbustosus/envdoctor/security/advisories/new>

Do not open a public issue for a suspected vulnerability. Do not include real credentials, dotenv values, access tokens, private keys, or sensitive repository contents in a report. Use clearly fake reproductions.

Include:

- affected version or commit
- impact and realistic attack scenario
- minimal reproduction steps
- whether terminal output, JSON output, package contents, or CI is affected
- any proposed mitigation

The maintainer aims to acknowledge complete reports within five business days. Disclosure timing will be coordinated after a fix and release path are available.

## Security boundaries

`env-doctor` performs deterministic local analysis. It does not need network access to scan a project, load production environment state, or send telemetry. Raw env values must never appear in public result types, human output, JSON output, snapshots, or diagnostics.

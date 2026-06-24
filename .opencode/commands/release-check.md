---
description: Check readiness for npm release and CI publishing
agent: infra-github-actions-engineer
subtask: true
---

Assess npm release readiness for `$ARGUMENTS`.

Use `release-and-ci` and `npm-package-standards`. Check package metadata, release workflow expectations, CI gates, npm provenance, secret handling, and `npm pack --dry-run` readiness. Return blocking issues first.

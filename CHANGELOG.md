# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2026-07-12

### Changed

- publish the package as unscoped `dotenv-drift` while preserving the `env-doctor` executable and tool identity

## [0.1.0] - 2026-07-12

This candidate was not published because npm rejected the original package name.

### Added

- deterministic dotenv and JavaScript/TypeScript source discovery
- dotenv parsing with same-file duplicate detection and locations
- AST-based `process.env` and `import.meta.env` usage analysis
- missing, unused, `.env.example` contract, duplicate, and secret-risk findings
- versioned human and JSON reports with a published JSON Schema
- configurable CI policy and reason-required finding suppressions
- strict project configuration through `.env-doctor.json`
- packed CLI, library, schema, and TypeScript consumer validation

### Security

- raw env values remain internal to parsing and secret-risk evaluation
- human output escapes control, ANSI, and bidirectional control characters

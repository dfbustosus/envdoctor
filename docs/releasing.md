# Release runbook

This runbook is for maintainers. Reading it does not authorize a release. Publishing, version changes, tags, and GitHub releases require an explicit release decision.

## Prerequisites

- `main` is protected and all required checks pass.
- The `npm-release` GitHub environment has a required reviewer.
- For the first publication, `NPM_TOKEN` exists only as a protected `npm-release` environment secret.
- The bootstrap npm token is short-lived, granular, has the minimum feasible write access, and uses npm's required 2FA/bypass configuration for automated publishing.
- The package name and account permissions have been verified directly with npm.
- The working tree is clean.

Never print, copy, or place the npm token in a command line, log, issue, commit, or pull request.

Because an unpublished package cannot always be selected as a package-scoped token target, the first publication is a bootstrap exception. Immediately after the first verified publish, configure npm Trusted Publishing for this repository, workflow, and environment; remove and revoke `NPM_TOKEN`; and disallow token publishing.

## Prepare the release

1. Decide the SemVer version from the actual compatibility impact.
2. Move relevant entries from `Unreleased` in `CHANGELOG.md` into a dated version section.
3. Update `package.json` and `package-lock.json` together in a reviewed pull request.
4. Confirm README examples, Node support, report schema, and exported declarations match the implementation.
5. Run from a clean checkout:

   ```sh
   npm ci
   npm run ci
   ```

6. Inspect the validated tarball contents, executable mode, checksum, installed CLI, root API, schema export, and downstream TypeScript compilation.
7. Merge the release preparation pull request before creating the tag.

## Tag and publish

1. Create a protected tag matching `v${package.json.version}` on the exact current `main` commit that will dispatch the workflow.
2. Open the **Publish npm package** workflow manually from `main`.
3. Enter the existing tag and exact `env-doctor@VERSION` confirmation.
4. Review the validation job and uploaded tarball checksum.
5. Approve the protected `npm-release` environment deployment.
6. The publish job publishes the validated tarball with public access and npm provenance.

Pushing a tag alone does not publish. The workflow has no tag-push trigger.

## Post-publish verification

Verify from a temporary directory:

```sh
npm view env-doctor version dist-tags --json
npm install env-doctor@VERSION
npx env-doctor --version
```

Confirm the npm provenance statement, repository link, README, binary, root export, and schema subpath.

## Recovery

- Never reuse or overwrite a published version.
- Fix forward with a new patch version.
- Deprecate a broken version when necessary and explain the replacement.
- Deleting a Git tag or GitHub release does not remove an npm package version.
- Revoke and replace `NPM_TOKEN` immediately if exposure is suspected.

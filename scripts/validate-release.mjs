import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';

const tag = process.env.RELEASE_TAG;
const confirmation = process.env.RELEASE_CONFIRMATION;
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const changelog = readFileSync('CHANGELOG.md', 'utf8');
const version = packageJson.version;
const expectedTag = `v${version}`;
const expectedConfirmation = `${packageJson.name}@${version}`;

assert(typeof tag === 'string' && /^v\d+\.\d+\.\d+$/u.test(tag), 'Release tag must be a stable SemVer tag beginning with v.');
assert(tag === expectedTag, `Release tag must equal ${expectedTag}.`);
assert(confirmation === expectedConfirmation, `Release confirmation must equal ${expectedConfirmation}.`);
assert(
  packageJson.repository?.url === 'git+https://github.com/dfbustosus/envdoctor.git',
  'Package repository metadata does not match the authorized repository.'
);
const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
assert(
  new RegExp(`^## \\[${escapedVersion}\\] - \\d{4}-\\d{2}-\\d{2}$`, 'mu').test(changelog),
  `CHANGELOG.md must contain a dated ${version} release section.`
);

const tagCommit = gitOutput(['rev-parse', '--verify', `refs/tags/${tag}^{commit}`], 'release tag verification');
const headCommit = gitOutput(['rev-parse', 'HEAD'], 'release commit verification');
assert(tagCommit === headCommit, 'Release tag must point at the exact trusted main commit being validated.');
assertCommand(['merge-base', '--is-ancestor', tagCommit, 'origin/main'], 'release tag ancestry verification');
assert(gitOutput(['status', '--porcelain', '--untracked-files=all'], 'clean working tree verification') === '', 'Release working tree must be clean.');

const registryCheck = spawnNpm(['view', `${packageJson.name}@${version}`, 'version', '--json']);
if (registryCheck.status === 0) {
  throw new Error(`${expectedConfirmation} already exists on npm.`);
}
const registryOutput = `${registryCheck.stdout ?? ''}\n${registryCheck.stderr ?? ''}`;
assert(registryOutput.includes('E404'), 'Unable to prove that the package version is unpublished.');

process.stdout.write(`Validated release identity for ${expectedConfirmation}.\n`);

function assertCommand(args, name) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  assert(result.status === 0, `${name} failed.`);
}

function gitOutput(args, name) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  assert(result.status === 0, `${name} failed.`);
  return result.stdout.trim();
}

function spawnNpm(args) {
  const npmCli = process.env.npm_execpath;
  assert(typeof npmCli === 'string', 'npm_execpath is required for release validation.');
  return spawnSync(process.execPath, [npmCli, ...args], { encoding: 'utf8' });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

import process from 'node:process';

const repository = process.env.GITHUB_REPOSITORY;
const commit = process.env.GITHUB_SHA;
const token = process.env.GITHUB_TOKEN;

assert(repository === 'dfbustosus/envdoctor', 'Unexpected GitHub repository.');
assert(typeof commit === 'string' && /^[a-f0-9]{40}$/u.test(commit), 'A full GITHUB_SHA is required.');
assert(typeof token === 'string' && token.length > 0, 'GITHUB_TOKEN is required.');

const response = await globalThis.fetch(`https://api.github.com/repos/${repository}/commits/${commit}/check-runs?per_page=100`, {
  headers: {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28'
  }
});
assert(response.ok, `Unable to read required checks: GitHub returned ${response.status}.`);

const payload = await response.json();
const checkRuns = Array.isArray(payload.check_runs) ? payload.check_runs : [];
const requiredChecks = [
  'Ubuntu 24.04 / Node.js 24 / release gate',
  'ubuntu-24.04 / Node.js 22.12.0',
  'windows-2025 / Node.js 24.x',
  'macos-15 / Node.js 24.x'
];

for (const requiredCheck of requiredChecks) {
  const matchingRuns = checkRuns.filter((run) => run?.name === requiredCheck);
  assert(matchingRuns.length > 0, `Required check is missing: ${requiredCheck}.`);
  assert(
    matchingRuns.some((run) => run.status === 'completed' && run.conclusion === 'success'),
    `Required check has not succeeded: ${requiredCheck}.`
  );
}

process.stdout.write(`Verified required CI checks for ${commit}.\n`);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

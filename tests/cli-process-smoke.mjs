import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = path.join(repositoryRoot, 'dist/cli.js');
const fixture = mkdtempSync(path.join(os.tmpdir(), 'env-doctor-process-'));

try {
  mkdirSync(path.join(fixture, 'src'), { recursive: true });
  writeFileSync(path.join(fixture, 'src/index.js'), 'process.env.PLATFORM_URL;\n');
  writeFileSync(
    path.join(fixture, '.env-doctor.json'),
    JSON.stringify({
      ci: true,
      failOn: ['missing'],
      suppressions: [
        {
          code: 'ENV_MISSING',
          key: 'PLATFORM_URL',
          reason: 'Injected by the deployment platform'
        }
      ]
    })
  );

  const suppressedScan = spawnSync(process.execPath, [cliPath, 'scan', '--cwd', fixture, '--json'], {
    encoding: 'utf8'
  });
  assert(suppressedScan.status === 0, `expected suppressed scan exit 0, received ${suppressedScan.status}`);
  assert(suppressedScan.stderr === '', 'expected suppressed scan stderr to be empty');
  const report = JSON.parse(suppressedScan.stdout);
  assert(report.findingTotals?.suppressedLocations === 1, 'expected one suppressed location in real-process report');
  assert(report.exitCode?.suggested === 0, 'expected clean real-process policy result');

  const invalidConfig = spawnSync(
    process.execPath,
    [cliPath, 'scan', '--cwd', fixture, '--config', 'missing.json', '--json'],
    { encoding: 'utf8' }
  );
  assert(invalidConfig.status === 2, `expected invalid config exit 2, received ${invalidConfig.status}`);
  assert(invalidConfig.stderr === '', 'expected JSON config error stderr to be empty');
  const errorReport = JSON.parse(invalidConfig.stdout);
  assert(errorReport.exitCode?.suggested === 2, 'expected JSON config error report');

  const packed = spawnSync(
    npmExecutable(),
    ['pack', '--json', '--ignore-scripts', '--pack-destination', fixture],
    { cwd: repositoryRoot, encoding: 'utf8' }
  );
  assert(packed.status === 0, `expected npm pack to succeed, received ${packed.status}`);
  const packResult = JSON.parse(packed.stdout);
  const tarballName = packResult[0]?.filename;
  assert(typeof tarballName === 'string', 'expected npm pack to return a tarball filename');

  const consumer = path.join(fixture, 'consumer');
  mkdirSync(consumer, { recursive: true });
  writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({ name: 'env-doctor-smoke', private: true, type: 'module' }));
  const installed = spawnSync(
    npmExecutable(),
    ['install', path.join(fixture, tarballName), '--ignore-scripts', '--no-audit', '--no-fund'],
    { cwd: consumer, encoding: 'utf8' }
  );
  assert(installed.status === 0, `expected packed package install to succeed, received ${installed.status}`);

  const installedBin = path.join(consumer, 'node_modules', '.bin', process.platform === 'win32' ? 'env-doctor.cmd' : 'env-doctor');
  const packedScan = spawnSync(installedBin, ['scan', '--cwd', fixture, '--json'], {
    encoding: 'utf8',
    shell: process.platform === 'win32'
  });
  assert(packedScan.status === 0, `expected packed CLI scan exit 0, received ${packedScan.status}`);
  assert(JSON.parse(packedScan.stdout).findingTotals?.suppressedLocations === 1, 'expected packed CLI to apply config suppression');

  const imported = spawnSync(
    process.execPath,
    ['--input-type=module', '--eval', "import { scanProject } from 'env-doctor'; if (typeof scanProject !== 'function') process.exit(1);"],
    { cwd: consumer, encoding: 'utf8' }
  );
  assert(imported.status === 0, 'expected packed root library export to import successfully');
} finally {
  rmSync(fixture, { force: true, recursive: true });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function npmExecutable() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

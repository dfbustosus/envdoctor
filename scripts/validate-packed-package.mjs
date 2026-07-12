import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { Ajv2020 } from 'ajv/dist/2020.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
const packageName = packageJson.name;
const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'env-doctor-package-'));
const requestedOutputDirectory = readOption('--output-dir');
const packageDirectory = requestedOutputDirectory === undefined
  ? path.join(temporaryRoot, 'package')
  : path.resolve(repositoryRoot, requestedOutputDirectory);

try {
  mkdirSync(packageDirectory, { recursive: true });
  const packed = spawnNpm(
    ['pack', '--json', '--pack-destination', packageDirectory],
    { cwd: repositoryRoot, encoding: 'utf8' }
  );
  assertCommand(packed, 'npm pack');

  const packEntry = parseJsonArray(packed.stdout)[0];
  assert(isRecord(packEntry), 'npm pack did not return package metadata');
  const tarballName = packEntry.filename;
  const packedFiles = packEntry.files;
  assert(typeof tarballName === 'string', 'npm pack did not return a tarball filename');
  assert(Array.isArray(packedFiles), 'npm pack did not return a package file list');
  validatePackageContents(packedFiles);

  const tarballPath = path.join(packageDirectory, tarballName);
  const consumer = path.join(temporaryRoot, 'consumer project');
  const project = path.join(temporaryRoot, 'fixture project with spaces & symbols');
  mkdirSync(consumer, { recursive: true });
  mkdirSync(path.join(project, 'src'), { recursive: true });

  writeFileSync(
    path.join(project, '.env'),
    'NEXT_PUBLIC_API_SECRET=fake_live_token_123\n'
  );
  writeFileSync(
    path.join(project, 'src/index.js'),
    'process.env.PLATFORM_URL;\nprocess.env.NEXT_PUBLIC_API_SECRET;\n'
  );
  writeJson(path.join(project, '.env-doctor.json'), {
    ci: true,
    failOn: ['missing'],
    suppressions: [
      {
        code: 'ENV_MISSING',
        key: 'PLATFORM_URL',
        reason: 'Injected by the deployment platform'
      }
    ]
  });
  writeJson(path.join(project, 'strict.json'), {
    ci: true,
    failOn: ['missing'],
    suppressions: []
  });
  writeJson(path.join(consumer, 'package.json'), {
    name: 'env-doctor-consumer-smoke',
    private: true,
    type: 'module'
  });

  const installed = spawnNpm(
    ['install', tarballPath, '--ignore-scripts', '--no-audit', '--no-fund'],
    { cwd: consumer, encoding: 'utf8' }
  );
  assertCommand(installed, 'packed package installation');

  const installedBin = path.join(
    consumer,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'env-doctor.cmd' : 'env-doctor'
  );
  assert(existsSync(installedBin), 'installed package did not create the env-doctor bin shim');
  const cleanScan = spawnInstalledBin(['scan', '--cwd', project, '--json'], consumer);
  assert(cleanScan.status === 0, `expected packed CLI exit 0, received ${cleanScan.status}`);
  assert(cleanScan.stderr === '', 'expected packed JSON success stderr to be empty');
  assertNoFakeSecret(cleanScan.stdout, 'packed JSON success output');
  const cleanReport = parseJsonReport(cleanScan.stdout, 'packed JSON success report');
  assert(cleanReport.findingTotals?.suppressedLocations === 1, 'expected packed config suppression');

  const findingScan = spawnInstalledBin(['scan', '--cwd', project, '--config', 'strict.json', '--json'], consumer);
  assert(findingScan.status === 1, `expected packed CLI exit 1, received ${findingScan.status}`);
  assert(findingScan.stderr === '', 'expected packed JSON finding stderr to be empty');
  assertNoFakeSecret(findingScan.stdout, 'packed JSON finding output');
  const findingReport = parseJsonReport(findingScan.stdout, 'packed JSON finding report');
  assert(
    findingReport.exitCode?.category === 'findings' && findingReport.exitCode?.suggested === 1,
    'expected packed finding policy result'
  );
  assert(
    findingReport.activeFindings?.some((finding) => finding.code === 'ENV_MISSING' && finding.key === 'PLATFORM_URL'),
    'expected active ENV_MISSING finding for PLATFORM_URL'
  );

  const errorScan = spawnInstalledBin(['scan', '--cwd', project, '--config', 'missing.json', '--json'], consumer);
  assert(errorScan.status === 2, `expected packed CLI exit 2, received ${errorScan.status}`);
  assert(errorScan.stderr === '', 'expected packed JSON error stderr to be empty');
  const errorReport = parseJsonReport(errorScan.stdout, 'packed JSON error report');
  assert(errorReport.exitCode?.suggested === 2, 'expected packed JSON error report');

  const humanScan = spawnInstalledBin(['scan', '--cwd', project, '--no-fail'], consumer);
  assert(humanScan.status === 0, `expected packed human scan exit 0, received ${humanScan.status}`);
  assert(humanScan.stderr === '', 'expected packed human scan stderr to be empty');
  assert(humanScan.stdout.includes('env-doctor scan'), 'expected packed human report');
  assertNoFakeSecret(humanScan.stdout, 'packed human output');

  const installedSchemaPath = path.join(
    consumer,
    'node_modules',
    packageName,
    'schemas',
    'scan-report-v1.schema.json'
  );
  const schema = JSON.parse(readFileSync(installedSchemaPath, 'utf8'));
  const validate = new Ajv2020({ allErrors: true, strict: false, validateFormats: false }).compile(schema);
  assert(validate(cleanReport), `packed success report failed schema validation: ${JSON.stringify(validate.errors)}`);
  assert(validate(findingReport), `packed finding report failed schema validation: ${JSON.stringify(validate.errors)}`);
  assert(validate(errorReport), `packed error report failed schema validation: ${JSON.stringify(validate.errors)}`);

  writeFileSync(
    path.join(consumer, 'library-smoke.mjs'),
    [
      "import { readFile } from 'node:fs/promises';",
      "import { fileURLToPath } from 'node:url';",
      `import { scanProject } from ${JSON.stringify(packageName)};`,
      'const report = await scanProject({ envFiles: [], sourcePaths: [] });',
      "if (report.reportVersion !== 1) throw new Error('unexpected report version');",
      `const schemaUrl = import.meta.resolve(${JSON.stringify(`${packageName}/schema/scan-report-v1.json`)});`,
      'const exportedSchema = JSON.parse(await readFile(fileURLToPath(schemaUrl), \'utf8\'));',
      "if (!String(exportedSchema.$id).includes('scan-report-v1')) throw new Error('schema export failed');"
    ].join('\n')
  );
  assertCommand(
    spawnSync(process.execPath, ['library-smoke.mjs'], { cwd: consumer, encoding: 'utf8' }),
    'packed library and schema import'
  );

  writeFileSync(
    path.join(consumer, 'index.ts'),
    [
      `import { scanProject, type FindingCode, type ScanOptions } from ${JSON.stringify(packageName)};`,
      "const options: ScanOptions = { envFiles: [], sourcePaths: [] };",
      "const code: FindingCode = 'ENV_MISSING';",
      'void code;',
      'void scanProject(options);',
      '// @ts-expect-error unsupported finding code',
      "const invalidCode: FindingCode = 'ENV_NOT_REAL';",
      'void invalidCode;'
    ].join('\n')
  );
  writeJson(path.join(consumer, 'tsconfig.json'), {
    compilerOptions: {
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      noEmit: true,
      strict: true,
      target: 'ES2022'
    },
    include: ['index.ts']
  });
  assertCommand(
    spawnSync(
      process.execPath,
      [path.join(repositoryRoot, 'node_modules', 'typescript', 'bin', 'tsc'), '--project', 'tsconfig.json'],
      { cwd: consumer, encoding: 'utf8' }
    ),
    'packed TypeScript consumer compilation'
  );

  const digest = createHash('sha256').update(readFileSync(tarballPath)).digest('hex');
  if (requestedOutputDirectory !== undefined) {
    writeFileSync(`${tarballPath}.sha256`, `${digest}  ${path.basename(tarballPath)}\n`);
  }
  process.stdout.write(`Validated ${tarballPath}\nSHA-256 ${digest}\n`);
} finally {
  rmSync(temporaryRoot, { force: true, recursive: true });
}

function validatePackageContents(files) {
  const entries = files.filter(isRecord);
  const paths = new Set(entries.map((entry) => entry.path).filter((entry) => typeof entry === 'string'));
  const expected = new Set([
    'LICENSE',
    'CHANGELOG.md',
    'README.md',
    'SECURITY.md',
    'package.json',
    'schemas/scan-report-v1.schema.json'
  ]);
  for (const sourcePath of listTypeScriptSources(path.join(repositoryRoot, 'src'))) {
    const relative = path.relative(path.join(repositoryRoot, 'src'), sourcePath).split(path.sep).join('/');
    const outputBase = `dist/${relative.slice(0, -3)}`;
    expected.add(`${outputBase}.js`);
    expected.add(`${outputBase}.d.ts`);
    expected.add(`${outputBase}.d.ts.map`);
  }

  const missing = [...expected].filter((expectedPath) => !paths.has(expectedPath)).sort();
  const unexpected = [...paths].filter((packedPath) => !expected.has(packedPath)).sort();
  assert(missing.length === 0, `packed artifact is missing ${sanitizeDiagnostic(missing.join(', '))}`);
  assert(unexpected.length === 0, `packed artifact contains unexpected paths: ${sanitizeDiagnostic(unexpected.join(', '))}`);

  for (const packedPath of paths) {
    assert(!packedPath.endsWith('.tgz'), `nested tarball is not allowed: ${sanitizeDiagnostic(packedPath)}`);
  }

  const cliEntry = entries.find((entry) => entry.path === 'dist/cli.js');
  if (process.platform !== 'win32') {
    assert(cliEntry?.mode === 0o755, `expected dist/cli.js mode 0755, received ${cliEntry?.mode}`);
  }
}

function spawnInstalledBin(args, cwd) {
  return spawnNpm(['exec', '--offline', '--', 'env-doctor', ...args], {
    cwd,
    encoding: 'utf8'
  });
}

function spawnNpm(args, options) {
  const npmCli = process.env.npm_execpath;
  if (npmCli === undefined) {
    throw new Error('npm_execpath is required for package validation');
  }
  return spawnSync(process.execPath, [npmCli, ...args], options);
}

function assertCommand(result, name) {
  assert(
    result.status === 0,
    `${name} failed with status ${result.status}: ${sanitizeDiagnostic(result.stderr || result.stdout || '')}`
  );
}

function assertNoFakeSecret(output, name) {
  assert(!output.includes('fake_live_token_123'), `${name} leaked the fake secret fixture`);
}

function parseJsonArray(output) {
  for (let index = output.lastIndexOf('['); index >= 0; index = output.lastIndexOf('[', index - 1)) {
    try {
      const parsed = JSON.parse(output.slice(index));
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Continue searching for the JSON payload before lifecycle output.
    }
  }
  throw new Error('Unable to parse npm pack JSON output');
}

function parseJsonReport(output, name) {
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`${name} was not valid JSON.`);
  }
}

function listTypeScriptSources(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return listTypeScriptSources(entryPath);
    }
    return entry.isFile() && entry.name.endsWith('.ts') ? [entryPath] : [];
  });
}

function sanitizeDiagnostic(value) {
  return [...String(value).replaceAll('fake_live_token_123', '[REDACTED]')].map((character) => {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) {
      return '';
    }
    return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)
      ? `\\u{${codePoint.toString(16).padStart(4, '0')}}`
      : character;
  }).join('');
}

function readOption(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

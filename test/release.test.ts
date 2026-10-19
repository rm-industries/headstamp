import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const validate = fileURLToPath(new URL('../scripts/validate-release.ts', import.meta.url));

for (const scenario of [
  { name: 'accepts a matching stable release', version: '0.1.0', tag: 'v0.1.0', prerelease: 'false', output: 'latest' },
  { name: 'puts prereleases on next', version: '0.2.0-rc.1', tag: 'v0.2.0-rc.1', prerelease: 'true', output: 'next' },
  {
    name: 'rejects a mismatched tag',
    version: '0.1.0',
    tag: 'v0.2.0',
    prerelease: 'false',
    error: /Release tag must match/,
  },
  {
    name: 'requires the v prefix',
    version: '0.1.0',
    tag: '0.1.0',
    prerelease: 'false',
    error: /Release tag must match/,
  },
  {
    name: 'rejects a mismatched lockfile',
    version: '0.1.0',
    tag: 'v0.1.0',
    prerelease: 'false',
    lock: '0.0.1',
    error: /Lockfile version must match/,
  },
  {
    name: 'rejects a mismatched lockfile root',
    version: '0.1.0',
    tag: 'v0.1.0',
    prerelease: 'false',
    root: '0.0.1',
    error: /Lockfile root package version must match/,
  },
  {
    name: 'rejects marking a stable version as a prerelease',
    version: '0.1.0',
    tag: 'v0.1.0',
    prerelease: 'true',
    error: /prerelease status must match/,
  },
  {
    name: 'rejects a prerelease marked stable',
    version: '0.2.0-rc.1',
    tag: 'v0.2.0-rc.1',
    prerelease: 'false',
    error: /prerelease status must match/,
  },
]) {
  test(`release validation ${scenario.name}`, (t) => {
    const directory = mkdtempSync(join(tmpdir(), 'headstamp-release-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    writeFileSync(join(directory, 'package.json'), JSON.stringify({ version: scenario.version }));
    writeFileSync(
      join(directory, 'package-lock.json'),
      JSON.stringify({
        version: scenario.lock ?? scenario.version,
        packages: { '': { version: scenario.root ?? scenario.version } },
      }),
    );
    const result = spawnSync(process.execPath, [validate], {
      cwd: directory,
      encoding: 'utf8',
      timeout: 30000,
      env: { ...process.env, RELEASE_TAG: scenario.tag, RELEASE_PRERELEASE: scenario.prerelease },
    });
    if (scenario.error) {
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, scenario.error);
      assert.equal(result.stdout, '');
    } else {
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.equal(result.stdout, `npm-tag=${scenario.output}\n`);
    }
  });
}

const publish = fileURLToPath(new URL('../scripts/publish-release.ts', import.meta.url));

const fixtureIntegrity =
  'sha512-lOlQ7aSocOZWXUThS5DxbAo4HNaTBFKcgfa9QIrxPFFVFrhBfgBfwxCT+qSxPekkNkVt0lKJqyhnw6V2+pSESQ==';
for (const scenario of [
  { name: 'publishes a verified new version', registry: 'missing', publishes: true },
  { name: 'skips an identical existing version', registry: 'identical', publishes: false },
  {
    name: 'rejects a changed archive before registry access',
    registry: 'missing',
    changed: true,
    error: /Downloaded tarball must match/,
  },
  { name: 'rejects a different existing version', registry: 'different', error: /already exists with different/ },
  { name: 'stops on registry failures', registry: 'unavailable', error: /Registry lookup failed/ },
]) {
  test(`release publication ${scenario.name}`, (t) => {
    const directory = mkdtempSync(join(tmpdir(), 'headstamp-publish-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const bin = join(directory, 'bin');
    mkdirSync(bin);
    mkdirSync(join(directory, 'release'));
    writeFileSync(join(directory, 'release', 'package.tgz'), scenario.changed ? 'changed' : 'fixture');
    const log = join(directory, 'npm-calls.json');
    const settings = JSON.stringify({ registry: scenario.registry, integrity: fixtureIntegrity, log });
    writeFileSync(
      join(bin, 'npm'),
      `#!/usr/bin/env node
const {writeFileSync} = require('node:fs');
const settings = ${settings};
const args = process.argv.slice(2);
if (args[0] === 'view') {
  if (settings.registry === 'missing') {console.log(JSON.stringify({error: {code: 'E404'}})); process.exit(1);}
  if (settings.registry === 'unavailable') {console.log(JSON.stringify({error: {code: 'E503'}})); process.exit(1);}
  console.log(JSON.stringify(settings.registry === 'identical' ? settings.integrity : 'sha512-other'));
} else {
  writeFileSync(settings.log, JSON.stringify(args));
}
`,
      { mode: 0o755 },
    );
    const result = spawnSync(process.execPath, [publish], {
      cwd: directory,
      encoding: 'utf8',
      timeout: 30000,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        TARBALL: 'package.tgz',
        PACKAGE_NAME: '@rm-industries/oxlint-plugin-headstamp',
        PACKAGE_VERSION: '0.1.0',
        NPM_TAG: 'latest',
        EXPECTED_INTEGRITY: fixtureIntegrity,
      },
    });
    if (scenario.error) {
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, scenario.error);
      assert.equal(existsSync(log), false);
    } else {
      assert.equal(result.status, 0, result.stdout + result.stderr);
      if (scenario.publishes) {
        assert.deepEqual(JSON.parse(readFileSync(log, 'utf8')), [
          'publish',
          realpathSync(join(directory, 'release', 'package.tgz')),
          '--ignore-scripts',
          '--access',
          'public',
          '--tag',
          'latest',
        ]);
      } else {
        assert.equal(existsSync(log), false);
        assert.match(result.stdout, /publication is skipped/);
      }
    }
  });
}

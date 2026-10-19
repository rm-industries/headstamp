import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const version = manifest.version;
assert.equal(typeof version, 'string', 'Package version must be a string.');
assert.equal(process.env.RELEASE_TAG, `v${version}`, 'Release tag must match package.json version.');
assert.equal(lock.version, version, 'Lockfile version must match package.json.');
assert.equal(lock.packages[''].version, version, 'Lockfile root package version must match package.json.');
const isPrerelease = version.split('+')[0].includes('-');
assert.equal(
  process.env.RELEASE_PRERELEASE,
  String(isPrerelease),
  'GitHub prerelease status must match the package version.',
);
console.log(`npm-tag=${isPrerelease ? 'next' : 'latest'}`);

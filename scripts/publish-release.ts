import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const { TARBALL, PACKAGE_NAME, PACKAGE_VERSION, EXPECTED_INTEGRITY, NPM_TAG } = process.env;
assert(TARBALL && PACKAGE_NAME && PACKAGE_VERSION && EXPECTED_INTEGRITY && NPM_TAG, 'Release metadata is required.');
const path = resolve('release', TARBALL);
const integrity = `sha512-${createHash('sha512').update(readFileSync(path)).digest('base64')}`;
assert.equal(integrity, EXPECTED_INTEGRITY, 'Downloaded tarball must match the prepared package.');
const registry = spawnSync('npm', ['view', `${PACKAGE_NAME}@${PACKAGE_VERSION}`, 'dist.integrity', '--json'], {
  encoding: 'utf8',
  timeout: 30000,
});
assert.equal(registry.error, undefined, 'Registry lookup could not run.');
const result = JSON.parse(registry.stdout || '{}');
if (registry.status === 0) {
  assert.equal(result, integrity, 'This version already exists with different package contents.');
  console.log('The identical npm version already exists; publication is skipped.');
} else {
  assert.equal(result.error?.code, 'E404', 'Registry lookup failed; publication stopped.');
  execFileSync('npm', ['publish', path, '--ignore-scripts', '--access', 'public', '--tag', NPM_TAG], {
    stdio: 'inherit',
  });
}

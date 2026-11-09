import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

test('README SPDX config inserts a Git-derived year and preserves historical years on repair', (t) => {
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  const snippet = (heading: string) => {
    const section = readme.split(heading + '\n')[1];
    const code = section?.match(/```ts\n([\s\S]*?)\n```/)?.[1];
    assert.ok(code, heading);
    return code;
  };
  const directory = mkdtempSync(join(root, '.headstamp-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const git = (...args: string[]) => {
    const result = spawnSync('git', args, {
      cwd: directory,
      encoding: 'utf8',
      env: { ...process.env, GIT_AUTHOR_DATE: '2020-06-01T12:00:00Z', GIT_COMMITTER_DATE: '2020-06-01T12:00:00Z' },
    });
    assert.equal(result.status, 0, result.stderr);
  };
  git('init');
  git(
    '-c',
    'user.name=Headstamp',
    '-c',
    'user.email=tests@example.invalid',
    'commit',
    '--allow-empty',
    '-m',
    'Fixture',
  );
  const config = snippet('## SPDX header example').replace(
    'const year = String(new Date().getUTCFullYear());',
    snippet('### Optional Git-derived year'),
  );
  writeFileSync(join(directory, 'oxlint.config.ts'), config);
  mkdirSync(join(directory, 'src'));
  const missing = join(directory, 'src/missing.ts');
  const historical = join(directory, 'src/historical.ts');
  writeFileSync(missing, 'export {};\n');
  writeFileSync(
    historical,
    '// SPDX-License-Identifier: Apache-2.0\n// SPDX-FileCopyrightText: 2010-2018 Acme\n\nexport {};\n',
  );

  const lint = (...args: string[]) => {
    const result = spawnSync(
      process.execPath,
      [join(root, 'node_modules/oxlint/bin/oxlint'), '--threads', '1', ...args, 'src'],
      { cwd: directory, encoding: 'utf8', timeout: 30000 },
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
  };
  lint('--fix');
  assert.equal(
    readFileSync(missing, 'utf8'),
    '// SPDX-License-Identifier: MIT\n// SPDX-FileCopyrightText: 2020 Acme\n\nexport {};\n',
  );
  assert.equal(
    readFileSync(historical, 'utf8'),
    '// SPDX-License-Identifier: MIT\n// SPDX-FileCopyrightText: 2010-2018 Acme\n\nexport {};\n',
  );
  lint();
});

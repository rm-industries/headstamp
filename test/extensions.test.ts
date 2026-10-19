import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const cli = join(root, 'node_modules/oxlint/bin/oxlint');
const sources = {
  js: 'export const message = "Hello 🌍";\n',
  mjs: 'export const location = import.meta.url;\n',
  cjs: 'module.exports = { message: "Hello 🌍" };\n',
  ts: 'export const count: number = 1;\n',
  mts: 'export const identity = <T,>(value: T): T => value;\n',
  cts: 'const count: number = 1;\nexport = count;\n',
  jsx: 'export const view = <><span>Hello 🌍</span></>;\n',
  tsx: 'type Props = { label: string };\nexport const view = ({ label }: Props) => <span>{label}</span>;\n',
};

for (const [extension, body] of Object.entries(sources)) {
  test(`ordinary .${extension} headers report, insert, accept, preserve source, and converge`, (t) => {
    const directory = mkdtempSync(join(root, '.headstamp-test-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    writeFileSync(
      join(directory, '.oxlintrc.json'),
      JSON.stringify({
        categories: { correctness: 'off' },
        jsPlugins: [{ name: 'headstamp', specifier: '@rm-industries/oxlint-plugin-headstamp' }],
        rules: { 'headstamp/header': ['error', { template: '/* Acme */' }] },
      }),
    );
    const lint = (...args: string[]) =>
      spawnSync(process.execPath, [cli, '--format', 'default', '--threads', '1', ...args], {
        cwd: directory,
        encoding: 'utf8',
        timeout: 30000,
      });
    for (const variant of [
      { name: 'lf', prefix: '', newline: '\n' },
      { name: 'crlf', prefix: '', newline: '\r\n' },
      { name: 'bom', prefix: '\uFEFF', newline: '\n' },
      { name: 'shebang', prefix: '#!/usr/bin/env node\r\n', newline: '\r\n' },
    ]) {
      const name = `${variant.name}.${extension}`;
      const path = join(directory, name);
      const source = variant.prefix + body.replaceAll('\n', variant.newline);
      const expected =
        variant.prefix + `/* Acme */${variant.newline}${variant.newline}` + body.replaceAll('\n', variant.newline);
      writeFileSync(path, source);
      const missing = lint(name);
      assert.equal(missing.status, 1, missing.stdout + missing.stderr);
      assert.match(missing.stdout + missing.stderr, /Missing required header/);
      assert.equal(readFileSync(path, 'utf8'), source);
      const fixed = lint('--fix', name);
      assert.equal(fixed.status, 0, fixed.stdout + fixed.stderr);
      assert.equal(readFileSync(path, 'utf8'), expected);
      const valid = lint(name);
      assert.equal(valid.status, 0, valid.stdout + valid.stderr);
      assert.equal(readFileSync(path, 'utf8'), expected);
      const repeated = lint('--fix', name);
      assert.equal(repeated.status, 0, repeated.stdout + repeated.stderr);
      assert.equal(readFileSync(path, 'utf8'), expected);
    }
  });
}

test('ordinary source discovery respects isolated overrides, disabled rules, and ignores', (t) => {
  const directory = mkdtempSync(join(root, '.headstamp-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const header = {
    template: '/* {{owner}} */',
    values: { owner: { pattern: 'Acme', replacement: 'Acme' } },
    allowedLeadingComments: ['// @ts-check'],
  };
  writeFileSync(
    join(directory, '.oxlintrc.json'),
    JSON.stringify({
      categories: { correctness: 'off' },
      jsPlugins: [{ name: 'headstamp', specifier: '@rm-industries/oxlint-plugin-headstamp' }],
      ignorePatterns: ['ignored.*'],
      rules: { 'headstamp/header': ['error', header] },
      overrides: [
        { files: ['disabled.*'], rules: { 'headstamp/header': 'off' } },
        ...Object.keys(sources).map((extension) => ({
          files: [`alternate.${extension}`],
          rules: {
            'headstamp/header': [
              'error',
              {
                ...header,
                values: { owner: { pattern: `Owner-${extension}`, replacement: `Owner-${extension}` } },
              },
            ],
          },
        })),
      ],
    }),
  );
  const expected = new Map<string, string>();
  for (const [extension, body] of Object.entries(sources)) {
    for (const kind of ['source', 'alternate', 'disabled', 'ignored']) {
      const name = `${kind}.${extension}`;
      const source = '// @ts-check\n' + body;
      writeFileSync(join(directory, name), source);
      const owner = kind === 'alternate' ? `Owner-${extension}` : 'Acme';
      const inactive = kind === 'disabled' || kind === 'ignored';
      expected.set(name, inactive ? source : `// @ts-check\n/* ${owner} */\n\n${body}`);
    }
  }
  const lint = (...args: string[]) =>
    spawnSync(process.execPath, [cli, '--format', 'default', '--threads', '1', ...args, '.'], {
      cwd: directory,
      encoding: 'utf8',
      timeout: 30000,
    });
  for (const args of [['--fix'], [], ['--fix']]) {
    const result = lint(...args);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    for (const [name, content] of expected) assert.equal(readFileSync(join(directory, name), 'utf8'), content, name);
  }
});

test('oxlint rejects BOM-before-shebang inputs before header fixes across ordinary extensions', (t) => {
  const directory = mkdtempSync(join(root, '.headstamp-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(
    join(directory, '.oxlintrc.json'),
    JSON.stringify({
      categories: { correctness: 'off' },
      jsPlugins: [{ name: 'headstamp', specifier: '@rm-industries/oxlint-plugin-headstamp' }],
      rules: { 'headstamp/header': ['error', { template: '/* Acme */' }] },
    }),
  );
  for (const [extension, body] of Object.entries(sources)) {
    const name = `combined.${extension}`;
    const source = '\uFEFF#!/usr/bin/env node\n' + body;
    writeFileSync(join(directory, name), source);
    const result = spawnSync(process.execPath, [cli, '--format', 'default', '--fix', name], {
      cwd: directory,
      encoding: 'utf8',
      timeout: 30000,
    });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout + result.stderr, /Invalid Character `!`/);
    assert.doesNotMatch(result.stdout + result.stderr, /Missing required header/);
    assert.equal(readFileSync(join(directory, name), 'utf8'), source);
  }
});

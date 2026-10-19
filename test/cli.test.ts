import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const cli = join(root, 'node_modules/oxlint/bin/oxlint');

test('TypeScript config, external templates, overrides and ignores work through the CLI', (t) => {
  const directory = mkdtempSync(join(root, '.headstamp-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const write = (name: string, content: string) => writeFileSync(join(directory, name), content);
  const read = (name: string) => readFileSync(join(directory, name), 'utf8');
  const lint = (...args: string[]) =>
    spawnSync(process.execPath, [cli, '--format', 'default', '--threads', '1', ...args, '.'], {
      cwd: directory,
      encoding: 'utf8',
      timeout: 30000,
    });
  write('HEADER.txt', '/* Acme */\n');
  write(
    'oxlint.config.ts',
    `
import { defineConfig } from "oxlint";
import { readFileSync } from "node:fs";
import type { HeaderOptions } from "@rm-industries/oxlint-plugin-headstamp";
const header = { template: readFileSync(new URL("./HEADER.txt", import.meta.url), "utf8") } satisfies HeaderOptions;
export default defineConfig({
  categories: { correctness: "off" },
  jsPlugins: [{ name: "headstamp", specifier: "@rm-industries/oxlint-plugin-headstamp" }],
  ignorePatterns: ["oxlint.config.ts", "ignored.js"],
  rules: { "headstamp/header": ["error", header] },
  overrides: [
    { files: ["disabled.js"], rules: { "headstamp/header": "off" } },
    { files: ["inline.ts"], rules: { "headstamp/header": ["error", { template: "// Inline" }] } }
  ]
});

`,
  );
  const inputs = {
    'source.js': 'export {};\n',
    'types.ts': 'export const value: number = 1;\n',
    'view.jsx': 'export const view = <div />;\n',
    'view.tsx': 'export const view = <div />;\n',
    'inline.ts': 'export {};\n',
    'bom.js': '\uFEFFexport {};\r\n',
    'shebang.js': '#!/usr/bin/env node\nexport {};\n',
    'ignored.js': 'export {};\n',
    'disabled.js': 'export {};\n',
  };
  for (const [name, content] of Object.entries(inputs)) write(name, content);
  const before = lint();
  assert.equal(before.status, 1, before.stdout + before.stderr);
  assert.match(before.stdout + before.stderr, /Missing required header/);
  const fixed = lint('--fix');
  assert.equal(fixed.status, 0, fixed.stdout + fixed.stderr);
  assert.equal(read('source.js'), '/* Acme */\n\nexport {};\n');
  assert.equal(read('inline.ts'), '// Inline\n\nexport {};\n');
  assert.equal(read('bom.js'), '\uFEFF/* Acme */\r\n\r\nexport {};\r\n');
  assert.equal(read('shebang.js'), '#!/usr/bin/env node\n/* Acme */\n\nexport {};\n');
  for (const name of ['types.ts', 'view.jsx', 'view.tsx'] as const) {
    assert.equal(read(name), '/* Acme */\n\n' + inputs[name]);
  }
  assert.equal(read('ignored.js'), inputs['ignored.js']);
  assert.equal(read('disabled.js'), inputs['disabled.js']);
  const after = Object.fromEntries(Object.keys(inputs).map((name) => [name, read(name)]));
  const repeated = lint('--fix');
  assert.equal(repeated.status, 0, repeated.stdout + repeated.stderr);
  for (const [name, content] of Object.entries(after)) assert.equal(read(name), content);
  write('conflict.js', '/** User documentation */\nexport {};\n');
  const conflict = lint('--fix');
  assert.equal(conflict.status, 1, conflict.stdout + conflict.stderr);
  assert.equal(read('conflict.js'), '/** User documentation */\nexport {};\n');
  write(
    'contract.ts',
    `
import type { HeaderOptions, HeaderValue } from "@rm-industries/oxlint-plugin-headstamp";
const valid: HeaderOptions = { template: "/* Acme */" };
const field: HeaderValue = { pattern: "Acme", replacement: "Acme" };
const templated: HeaderOptions = { template: "/* {{owner}} */", values: { owner: field } };
// @ts-expect-error A template is required.
const missing: HeaderOptions = {};
// @ts-expect-error A template must be a string.
const invalid: HeaderOptions = { template: 42 };
// @ts-expect-error Replacement values must be strings.
const invalidField: HeaderValue = { pattern: "Acme", replacement: 42 };
// @ts-expect-error Placeholder definitions require a pattern.
const missingPattern: HeaderValue = { replacement: "Acme" };
`,
  );
  const types = spawnSync(
    process.execPath,
    [
      join(root, 'node_modules/typescript/bin/tsc'),
      '--ignoreConfig',
      '--types',
      'node',
      '--noEmit',
      '--strict',
      '--skipLibCheck',
      '--module',
      'nodenext',
      '--target',
      'es2022',
      'oxlint.config.ts',
      'contract.ts',
    ],
    { cwd: directory, encoding: 'utf8', timeout: 30000 },
  );
  assert.equal(types.status, 0, types.stdout + types.stderr);
});

test('invalid header configuration fails without modifying source', (t) => {
  const directory = mkdtempSync(join(root, '.headstamp-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const source = join(directory, 'source.js');
  writeFileSync(source, 'export {};\n');
  const field = { pattern: '.+', replacement: 'Acme' };
  for (const options of [
    {},
    { template: 42 },
    { template: '' },
    { template: 'Copyright Acme' },
    { template: '/* unclosed' },
    { template: '/*/' },
    { template: '/* Acme */\nexport {};' },
    { template: '/* Acme */ /* other */' },
    { template: '// Acme\nnot a comment' },
    { template: '// Acme\r// other' },
    { template: '// Acme\u2028export {};' },
    { template: '/* Acme */', unexpected: true },
    { template: '/* {{owner}} */' },
    { template: '/* {{constructor}} */', values: {} },
    { template: '/* {{owner}} */', values: null },
    { template: '/* {{owner}} */', values: [] },
    { template: '/* {{owner}} */', values: { owner: { pattern: '(', replacement: 'Acme' } } },
    { template: '/* {{owner}} */', values: { owner: { pattern: 'Acme)|(?:Other', replacement: 'Acme' } } },
    { template: '/* {{owner}} */', values: { owner: { replacement: 'Acme' } } },
    { template: '/* {{owner}} */', values: { owner: { pattern: '.+', replacement: 42 } } },
    { template: '/* {{owner}} */', values: { owner: { ...field, extra: true } } },
    { template: '/* {{owner}} */', values: { owner: field, unused: field } },
    { template: '/* {{owner}} {{owner}} */', values: { owner: field } },
    { template: '/* {{owner}}{{year}} */', values: { owner: field, year: field } },
    { template: '/* {{ owner }} */', values: { owner: field } },
    { template: '/* {{owner-name}} */', values: { 'owner-name': field } },
    { template: '/* {{own\ner}} */', values: { owner: field } },
    { template: '/* {{owner} */', values: { owner: field } },
    { template: '/* owner}} */' },
    { template: '/* {{owner}} */', values: { owner: { ...field, replacement: 'Acme\nOther' } } },
    { template: '// {{owner}}', values: { owner: { ...field, replacement: 'Acme\u2028export {};' } } },
    { template: '/* {{owner}} */', values: { owner: { ...field, replacement: '*/ export {}; /*' } } },
    {
      template: '/* {{owner}} :: {{year}} */',
      values: {
        owner: { ...field, replacement: 'Acme :: Inc' },
        year: { pattern: '.+', replacement: '2026' },
      },
    },
  ]) {
    writeFileSync(
      join(directory, '.oxlintrc.json'),
      JSON.stringify({
        categories: { correctness: 'off' },
        jsPlugins: [{ name: 'headstamp', specifier: '@rm-industries/oxlint-plugin-headstamp' }],
        rules: { 'headstamp/header': ['error', options] },
      }),
    );
    // GitHub's annotation reporter omits the details of thrown plugin errors.
    const result = spawnSync(process.execPath, [cli, '--format', 'default', '--fix', 'source.js'], {
      cwd: directory,
      encoding: 'utf8',
      timeout: 30000,
    });
    assert.notEqual(result.status, 0, JSON.stringify(options));
    assert.match(result.stdout + result.stderr, /Headstamp|headstamp|template/);
    assert.equal(readFileSync(source, 'utf8'), 'export {};\n');
  }
});

test('generated values and identical templates remain isolated across CLI overrides', (t) => {
  const directory = mkdtempSync(join(root, '.headstamp-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const write = (name: string, text: string) => writeFileSync(join(directory, name), text);
  const read = (name: string) => readFileSync(join(directory, name), 'utf8');
  const lint = (...args: string[]) =>
    spawnSync(process.execPath, [cli, '--format', 'default', '--threads', '1', ...args], {
      cwd: directory,
      encoding: 'utf8',
      timeout: 30000,
    });
  write('HEADER.txt', '/* Copyright {{year}} {{owner}} */\n');
  write(
    'oxlint.config.ts',
    String.raw`
import { readFileSync } from 'node:fs';
import { defineConfig } from 'oxlint';
import type { HeaderOptions } from '@rm-industries/oxlint-plugin-headstamp';
const header = {
  template: readFileSync(new URL('./HEADER.txt', import.meta.url), 'utf8'),
  values: {
    year: { pattern: '\\d{4}(?:-\\d{4})?', replacement: String(new Date('2026-01-01T00:00:00Z').getUTCFullYear()) },
    owner: { pattern: 'Acme|Other', replacement: 'Acme' },
  },
} satisfies HeaderOptions;
export default defineConfig({
  categories: { correctness: 'off' },
  jsPlugins: [{ name: 'headstamp', specifier: '@rm-industries/oxlint-plugin-headstamp' }],
  ignorePatterns: ['oxlint.config.ts', 'ignored.js'],
  rules: { 'headstamp/header': ['error', header] },
  overrides: [
    { files: ['alternate.ts'], rules: { 'headstamp/header': ['error', {
      ...header, values: {
        year: { pattern: '1999', replacement: '1999' },
        owner: { pattern: 'Other', replacement: 'Other' },
      },
    }] } },
    { files: ['disabled.js'], rules: { 'headstamp/header': 'off' } },
  ],
});
`,
  );
  const inputs = {
    'source.js': 'export {};\n',
    'types.ts': 'export const count: number = 1;\n',
    'view.jsx': 'export const view = <div />;\n',
    'view.tsx': 'export const view = <div />;\n',
  };
  for (const [name, content] of Object.entries(inputs)) write(name, content);
  write('alternate.ts', 'export {};\n');
  write('historical.ts', '/* Copyright 2001-2004 Acme */\nexport {};\n');
  write('ignored.js', 'export {};\n');
  write('disabled.js', 'export {};\n');
  const fixed = lint('--fix', '.');
  assert.equal(fixed.status, 0, fixed.stdout + fixed.stderr);
  for (const [name, content] of Object.entries(inputs))
    assert.equal(read(name), '/* Copyright 2026 Acme */\n\n' + content);
  assert.equal(read('alternate.ts'), '/* Copyright 1999 Other */\n\nexport {};\n');
  assert.equal(read('historical.ts'), '/* Copyright 2001-2004 Acme */\n\nexport {};\n');
  assert.equal(read('ignored.js'), 'export {};\n');
  assert.equal(read('disabled.js'), 'export {};\n');
  const repeated = lint('--fix', '.');
  assert.equal(repeated.status, 0, repeated.stdout + repeated.stderr);
  assert.equal(read('historical.ts'), '/* Copyright 2001-2004 Acme */\n\nexport {};\n');
  const invalid = '/* Copyright 202X Acme */\n\nexport {};\n';
  write('source.js', invalid);
  const report = lint('--fix', 'source.js');
  assert.equal(report.status, 1, report.stdout + report.stderr);
  assert.match(report.stdout + report.stderr, /year do not match/);
  assert.equal(read('source.js'), invalid);
  const alternateInvalid = '/* Copyright 2026 Acme */\n\nexport {};\n';
  write('alternate.ts', alternateInvalid);
  const alternateReport = lint('--fix', 'alternate.ts');
  assert.equal(alternateReport.status, 1, alternateReport.stdout + alternateReport.stderr);
  assert.match(alternateReport.stdout + alternateReport.stderr, /year, owner do not match/);
  assert.equal(read('alternate.ts'), alternateInvalid);
});

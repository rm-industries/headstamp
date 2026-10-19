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
const prefixed: HeaderOptions = { template: "/* Acme */", allowedLeadingComments: ["// @ts-check", { pattern: "// pragma" }] };
// @ts-expect-error Regex flags are not supported.
const flags: HeaderOptions = { template: "/* Acme */", allowedLeadingComments: [{ pattern: "// pragma", flags: "i" }] };
// @ts-expect-error Permitted comments must be literal comments or pattern objects.
const badPrefix: HeaderOptions = { template: "/* Acme */", allowedLeadingComments: [42] };
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
    ...[
      null,
      {},
      '// pragma',
      [null],
      [42],
      [{}],
      [{ pattern: 42 }],
      [{ pattern: '(', flags: 'i' }],
      [{ pattern: '(' }],
      [{ pattern: 'Acme)|(?:Other' }],
      [''],
      ['pragma'],
      ['/*/'],
      ['/* unclosed'],
      ['/* pragma */ /* other */'],
      ['// pragma\nexport {};'],
      ['// pragma\u2028export {};'],
      ['// pragma\r// other'],
    ].map((allowedLeadingComments) => ({ template: '/* Acme */', allowedLeadingComments })),
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
  const report = lint('source.js');
  assert.equal(report.status, 1, report.stdout + report.stderr);
  assert.match(report.stdout + report.stderr, /year do not match/);
  assert.equal(read('source.js'), invalid);
  const repaired = lint('--fix', 'source.js');
  assert.equal(repaired.status, 0, repaired.stdout + repaired.stderr);
  assert.equal(read('source.js'), '/* Copyright 2026 Acme */\n\nexport {};\n');
  const alternateInvalid = '/* Copyright 2026 Acme */\n\nexport {};\n';
  write('alternate.ts', alternateInvalid);
  const alternateReport = lint('alternate.ts');
  assert.equal(alternateReport.status, 1, alternateReport.stdout + alternateReport.stderr);
  assert.match(alternateReport.stdout + alternateReport.stderr, /year, owner do not match/);
  assert.equal(read('alternate.ts'), alternateInvalid);
  const alternateRepaired = lint('--fix', 'alternate.ts');
  assert.equal(alternateRepaired.status, 0, alternateRepaired.stdout + alternateRepaired.stderr);
  assert.equal(read('alternate.ts'), '/* Copyright 1999 Other */\n\nexport {};\n');
});

test('field repairs preserve historical years and converge through the CLI', (t) => {
  const directory = mkdtempSync(join(root, '.headstamp-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(
    join(directory, '.oxlintrc.json'),
    JSON.stringify({
      categories: { correctness: 'off' },
      jsPlugins: [{ name: 'headstamp', specifier: '@rm-industries/oxlint-plugin-headstamp' }],
      rules: {
        'headstamp/header': [
          'error',
          {
            template: '/* Copyright {{years}} {{owner}} */',
            values: {
              years: { pattern: '\\d{4}(?:-\\d{4})?', replacement: '2026' },
              owner: { pattern: 'Acme', replacement: 'Acme' },
            },
          },
        ],
      },
    }),
  );
  const source = join(directory, 'source.ts');
  writeFileSync(source, '\uFEFF/* Copyright 2001-2004 Other */\r\n  export const value: number = 1;\r\n');
  const expected = '\uFEFF/* Copyright 2001-2004 Acme */\r\n\r\n  export const value: number = 1;\r\n';
  for (let run = 0; run < 3; run++) {
    const result = spawnSync(process.execPath, [cli, '--format', 'default', '--fix', 'source.ts'], {
      cwd: directory,
      encoding: 'utf8',
      timeout: 30000,
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(readFileSync(source, 'utf8'), expected);
  }
});

test('incomplete scaffolds remain unsuccessful and stable until human completion', (t) => {
  const directory = mkdtempSync(join(root, '.headstamp-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(
    join(directory, '.oxlintrc.json'),
    JSON.stringify({
      categories: { correctness: 'off' },
      jsPlugins: [{ name: 'headstamp', specifier: '@rm-industries/oxlint-plugin-headstamp' }],
      rules: {
        'headstamp/header': [
          'error',
          {
            template: '/* Copyright {{years}} {{owner}}\n * Description: {{description}}\n */',
            values: {
              years: { pattern: '\\d{4}(?:-\\d{4})?', replacement: '2026' },
              owner: { pattern: 'Acme', replacement: 'Acme' },
              description: { pattern: '\\S.{9,}', replacement: '' },
            },
          },
        ],
      },
    }),
  );
  const source = join(directory, 'source.ts');
  const lint = (...args: string[]) =>
    spawnSync(process.execPath, [cli, '--format', 'default', '--threads', '1', ...args, 'source.ts'], {
      cwd: directory,
      encoding: 'utf8',
      timeout: 30000,
    });
  const read = () => readFileSync(source, 'utf8');
  const scaffold = '/* Copyright 2026 Acme\n * Description: \n */\n\nexport {};\n';
  writeFileSync(source, 'export {};\n');
  for (let run = 0; run < 3; run++) {
    const result = lint('--fix');
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout + result.stderr, /description do not match/);
    assert.equal(read(), scaffold);
  }
  const incomplete = lint();
  assert.equal(incomplete.status, 1, incomplete.stdout + incomplete.stderr);
  assert.match(incomplete.stdout + incomplete.stderr, /description do not match/);
  assert.equal(read(), scaffold);

  writeFileSync(source, '/* Copyright 2001-2004 Other\n * Description: WIP\n */\n\nexport {};\n');
  const attempted = '/* Copyright 2001-2004 Acme\n * Description: WIP\n */\n\nexport {};\n';
  for (let run = 0; run < 2; run++) {
    const result = lint('--fix');
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout + result.stderr, /description do not match/);
    assert.doesNotMatch(result.stdout + result.stderr, /Header field\(s\) (?:years|owner)/);
    assert.equal(read(), attempted);
  }

  const completed = '/* Copyright 2001-2004 Acme\n * Description: Loads application settings.\n */\n\nexport {};\n';
  writeFileSync(source, completed);
  const valid = lint();
  assert.equal(valid.status, 0, valid.stdout + valid.stderr);
  const fixed = lint('--fix');
  assert.equal(fixed.status, 0, fixed.stdout + fixed.stderr);
  assert.equal(read(), completed);
});

test('permitted prefixes preserve source, isolate overrides, and retain scaffold errors in the CLI', (t) => {
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
  write(
    'oxlint.config.ts',
    String.raw`
import { defineConfig } from 'oxlint';
import type { HeaderOptions } from '@rm-industries/oxlint-plugin-headstamp';
const header = {
  template: '/* Copyright {{years}} {{owner}} */',
  values: {
    years: {pattern: '\\d{4}(?:-\\d{4})?', replacement: '2026'},
    owner: {pattern: 'Acme', replacement: 'Acme'},
  },
  allowedLeadingComments: ['// @ts-check', {pattern: '/\\* pragma (?:one|two) \\*/'}],
} satisfies HeaderOptions;
export default defineConfig({
  categories: {correctness: 'off'},
  jsPlugins: [{name: 'headstamp', specifier: '@rm-industries/oxlint-plugin-headstamp'}],
  ignorePatterns: ['oxlint.config.ts', 'ignored.js'],
  rules: {'headstamp/header': ['error', header]},
  overrides: [
    {files: ['alternate.ts'], rules: {'headstamp/header': ['error', {...header, allowedLeadingComments: ['/* alternate */']}] }},
    {files: ['strict.js'], rules: {'headstamp/header': ['error', {...header, allowedLeadingComments: []}] }},
    {files: ['line.ts'], rules: {'headstamp/header': ['error', {template: '// Acme', allowedLeadingComments: ['// @ts-check']}] }},
    {files: ['disabled.js'], rules: {'headstamp/header': 'off'}},
    {files: ['scaffold.ts'], rules: {'headstamp/header': ['error', {
      ...header,
      template: '/* Copyright {{years}} {{owner}}\n * Description: {{description}}\n */',
      values: {...header.values, description: {pattern: '\\S.{9,}', replacement: ''}},
    }] }},
  ],
});
`,
  );
  const inputs = {
    'source.ts': '// @ts-check\nexport const value: number = 1;\n',
    'groups.js': '/* pragma one */\n/* pragma two */ \n\nexport {};\n',
    'bom.js': '\uFEFF// @ts-check\r\nexport {};\r\n',
    'script.js': '#!/usr/bin/env node\n// @ts-check\nexport {};\n',
    'prefix-only.js': '// @ts-check',
    'alternate.ts': '/* alternate */\nexport {};\n',
    'line.ts': '// @ts-check',
    'ignored.js': '// @ts-check\nexport {};\n',
    'disabled.js': '// @ts-check\nexport {};\n',
  };
  for (const [name, text] of Object.entries(inputs)) write(name, text);
  const fixed = lint('--fix', '.');
  assert.equal(fixed.status, 0, fixed.stdout + fixed.stderr);
  assert.equal(read('source.ts'), '// @ts-check\n/* Copyright 2026 Acme */\n\nexport const value: number = 1;\n');
  assert.equal(read('groups.js'), '/* pragma one */\n/* pragma two */ \n\n/* Copyright 2026 Acme */\n\nexport {};\n');
  assert.equal(read('bom.js'), '\uFEFF// @ts-check\r\n/* Copyright 2026 Acme */\r\n\r\nexport {};\r\n');
  assert.equal(read('script.js'), '#!/usr/bin/env node\n// @ts-check\n/* Copyright 2026 Acme */\n\nexport {};\n');
  assert.equal(read('prefix-only.js'), '// @ts-check\n/* Copyright 2026 Acme */\n');
  assert.equal(read('alternate.ts'), '/* alternate */\n/* Copyright 2026 Acme */\n\nexport {};\n');
  assert.equal(read('line.ts'), '// @ts-check\n\n// Acme\n');
  for (const name of ['ignored.js', 'disabled.js'] as const) assert.equal(read(name), inputs[name]);
  const snapshot = Object.fromEntries(Object.keys(inputs).map((name) => [name, read(name)]));
  const repeated = lint('--fix', '.');
  assert.equal(repeated.status, 0, repeated.stdout + repeated.stderr);
  for (const [name, text] of Object.entries(snapshot)) assert.equal(read(name), text);

  write('strict.js', '// @ts-check\nexport {};\n');
  write('alternate.ts', '// @ts-check\nexport {};\n');
  for (const name of ['strict.js', 'alternate.ts']) {
    const blocked = lint('--fix', name);
    assert.equal(blocked.status, 1, blocked.stdout + blocked.stderr);
    assert.match(blocked.stdout + blocked.stderr, /Opening comment does not match/);
    assert.equal(read(name), '// @ts-check\nexport {};\n');
  }
  write('scaffold.ts', '// @ts-check\nexport {};\n');
  const scaffold = '// @ts-check\n/* Copyright 2026 Acme\n * Description: \n */\n\nexport {};\n';
  for (let run = 0; run < 2; run++) {
    const result = lint('--fix', 'scaffold.ts');
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout + result.stderr, /description do not match/);
    assert.equal(read('scaffold.ts'), scaffold);
  }
  write('scaffold.ts', '// @ts-check\n/* Copyright 2001-2004 Other\n * Description: WIP\n */\n\nexport {};\n');
  const repaired = lint('--fix', 'scaffold.ts');
  assert.equal(repaired.status, 1, repaired.stdout + repaired.stderr);
  assert.match(repaired.stdout + repaired.stderr, /description do not match/);
  assert.equal(
    read('scaffold.ts'),
    '// @ts-check\n/* Copyright 2001-2004 Acme\n * Description: WIP\n */\n\nexport {};\n',
  );
});

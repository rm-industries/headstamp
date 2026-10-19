import { describe, it } from 'node:test';

import { RuleTester } from 'oxlint/plugins-dev';

import plugin from '../src/index.ts';

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester();
tester.run('header placeholders', plugin.rules.header, {
  valid: [
    ...(
      [
        ['js', 'export const count = 1;'],
        ['ts', 'export const count: number = 1;'],
        ['jsx', 'export const view = <div />;'],
        ['tsx', 'export const view: JSX.Element = <div />;'],
      ] as const
    ).map(([lang, code]) => ({
      name: `validates placeholders in ${lang} source`,
      filename: `source.${lang}`,
      languageOptions: { parserOptions: { lang } },
      code: `/* Copyright 2020 Acme */\n\n${code}\n`,
      options: [
        {
          template: '/* Copyright {{year}} Acme */',
          values: { year: { pattern: '\\d{4}', replacement: '2026' } },
        },
      ],
    })),
    {
      name: 'accepts an empty field when its pattern allows it',
      code: '/* Owner:  */\n\nexport {};\n',
      options: [{ template: '/* Owner: {{owner}} */', values: { owner: { pattern: '', replacement: '' } } }],
    },
    {
      name: 'treats prototype-like field names as explicit definitions',
      code: '/* Acme */\n\nexport {};\n',
      options: [
        { template: '/* {{constructor}} */', values: { constructor: { pattern: 'Acme', replacement: 'Acme' } } },
      ],
    },
    {
      name: 'accepts an empty values map with a literal template',
      code: '/* Acme */\n\nexport {};\n',
      options: [{ template: '/* Acme */', values: {} }],
    },
    {
      name: 'matches literal regex punctuation without interpreting it',
      code: '/* (c) [2020]. */\n\nexport {};\n',
      options: [{ template: '/* (c) [{{year}}]. */', values: { year: { pattern: '\\d{4}', replacement: '2026' } } }],
    },
    {
      name: 'accepts a placeholder at the end of a line comment',
      code: '// Owner: Acme\n\nexport {};\n',
      options: [{ template: '// Owner: {{owner}}', values: { owner: { pattern: '.+', replacement: 'Other' } } }],
    },
    {
      name: 'validates independent capture groups and backreferences',
      code: '/* aa :: bb */\n\nexport {};\n',
      options: [
        {
          template: '/* {{first}} :: {{second}} */',
          values: {
            first: { pattern: '(a)\\1', replacement: 'aa' },
            second: { pattern: '(b)\\1', replacement: 'bb' },
          },
        },
      ],
    },
    {
      name: 'preserves valid historical year ranges',
      code: '/* Copyright 2020-2024 Acme */\n\nexport {};\n',
      options: [
        {
          template: '/* Copyright {{years}} Acme */',
          values: { years: { pattern: '\\d{4}(?:-\\d{4})?', replacement: '2026' } },
        },
      ],
    },
    {
      name: 'uses patterns to disambiguate a separator inside a value',
      code: '/* Acme :: Inc :: 2020 */\n\nexport {};\n',
      options: [
        {
          template: '/* {{owner}} :: {{year}} */',
          values: {
            owner: { pattern: '.+', replacement: 'Acme :: Inc' },
            year: { pattern: '\\d{4}', replacement: '2026' },
          },
        },
      ],
    },
  ],
  invalid: [
    {
      name: 'preserves historical values while fixing spacing',
      code: '/* Copyright 2020-2024 Acme */\nexport {};\n',
      options: [
        {
          template: '/* Copyright {{years}} Acme */',
          values: { years: { pattern: '\\d{4}(?:-\\d{4})?', replacement: '2026' } },
        },
      ],
      errors: [{ messageId: 'spacing' }],
      output: '/* Copyright 2020-2024 Acme */\n\nexport {};\n',
    },
    {
      name: 'requires a whole-value regex match, including alternations',
      code: '/* Owner: AcmeOther */\n\nexport {};\n',
      options: [
        { template: '/* Owner: {{owner}} */', values: { owner: { pattern: 'Acme|Other', replacement: 'Acme' } } },
      ],
      errors: [{ messageId: 'invalidValue', data: { fields: 'owner' } }],
      output: null,
    },
    {
      name: 'reports all invalid fields when their boundaries are clear',
      code: '/* Year: yesterday; Owner: Other */\n\nexport {};\n',
      options: [
        {
          template: '/* Year: {{year}}; Owner: {{owner}} */',
          values: {
            year: { pattern: '\\d{4}', replacement: '2026' },
            owner: { pattern: 'Acme', replacement: 'Acme' },
          },
        },
      ],
      errors: [{ messageId: 'invalidValue', data: { fields: 'year, owner' } }],
      output: null,
    },
    {
      name: 'inserts replacement metacharacters as literal content',
      code: 'export {};\n',
      options: [
        { template: '// Owner: {{owner}}', values: { owner: { pattern: '.+', replacement: '$& $$ $1 \\ Acme' } } },
      ],
      errors: [{ messageId: 'missing' }],
      output: '// Owner: $& $$ $1 \\ Acme\n\nexport {};\n',
    },
    {
      name: 'generates a multiline template using source CRLF after a shebang',
      code: '#!/usr/bin/env node\r\nexport {};\r\n',
      options: [
        {
          template: '// Year: {{year}}\n// Owner: {{owner}}\n',
          values: {
            year: { pattern: '\\d{4}', replacement: '2026' },
            owner: { pattern: 'Acme', replacement: 'Acme' },
          },
        },
      ],
      errors: [{ messageId: 'missing' }],
      output: '#!/usr/bin/env node\r\n// Year: 2026\r\n// Owner: Acme\r\n\r\nexport {};\r\n',
    },
    {
      name: 'does not capture fields across source lines',
      code: '/* Owner: Acme\nOther */\n\nexport {};\n',
      options: [
        { template: '/* Owner: {{owner}} */', values: { owner: { pattern: '[\\s\\S]+', replacement: 'Acme' } } },
      ],
      errors: [{ messageId: 'mismatch' }],
      output: null,
    },
    {
      name: 'does not overwrite changed literal header wording',
      code: '/* Company: Acme */\n\nexport {};\n',
      options: [{ template: '/* Owner: {{owner}} */', values: { owner: { pattern: '.+', replacement: 'Acme' } } }],
      errors: [{ messageId: 'mismatch' }],
      output: null,
    },
    {
      name: 'accepts an intentionally invalid replacement as configuration',
      code: '// Description: \n\nexport {};\n',
      options: [
        { template: '// Description: {{description}}', values: { description: { pattern: '\\S.*', replacement: '' } } },
      ],
      errors: [{ messageId: 'invalidValue', data: { fields: 'description' } }],
      output: null,
    },
    {
      name: 'generates a missing header from replacement strings',
      code: 'export {};\n',
      options: [
        {
          template: '/* Copyright {{year}} Acme */',
          values: { year: { pattern: '\\d{4}', replacement: '2026' } },
        },
      ],
      errors: [{ messageId: 'missing' }],
      output: '/* Copyright 2026 Acme */\n\nexport {};\n',
    },
    {
      name: 'reports an invalid field without fixing it',
      code: '/* Copyright 202X Acme */\n\nexport {};\n',
      options: [
        {
          template: '/* Copyright {{year}} Acme */',
          values: { year: { pattern: '\\d{4}', replacement: '2026' } },
        },
      ],
      errors: [{ messageId: 'invalidValue', data: { fields: 'year' } }],
      output: null,
    },
    {
      name: 'refuses multiple valid field boundaries',
      code: '/* Acme :: Inc :: 2020 */\n\nexport {};\n',
      options: [
        {
          template: '/* {{owner}} :: {{year}} */',
          values: {
            owner: { pattern: '.+', replacement: 'Acme' },
            year: { pattern: '.+', replacement: '2026' },
          },
        },
      ],
      errors: [{ messageId: 'mismatch' }],
      output: null,
    },
    {
      name: 'refuses ambiguous boundaries across three placeholders',
      code: '/* a | b | c | d */\n\nexport {};\n',
      options: [
        {
          template: '/* {{first}} | {{second}} | {{third}} */',
          values: {
            first: { pattern: '.+', replacement: 'a' },
            second: { pattern: '.+', replacement: 'b' },
            third: { pattern: '.+', replacement: 'c' },
          },
        },
      ],
      errors: [{ messageId: 'mismatch' }],
      output: null,
    },
  ],
});

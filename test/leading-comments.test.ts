import { describe, it } from 'node:test';

import { RuleTester } from 'oxlint/plugins-dev';

import plugin, { type HeaderOptions } from '../src/index.ts';

const options = {
  template: '/* Acme */',
  allowedLeadingComments: ['// @ts-check', '/* pragma */'],
} satisfies HeaderOptions;

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester();
tester.run('permitted leading comments', plugin.rules.header, {
  valid: [
    {
      name: 'preserves multiple permitted units and all prefix spacing',
      code: '  /* pragma */  \n\n// @ts-check\n\n  /* Acme */\n\nexport {};\n',
      options: [options],
    },
    {
      name: 'accepts a complete line group as one permitted unit',
      code: '// first\n// second\n/* Acme */\n\nexport {};\n',
      options: [{ template: '/* Acme */', allowedLeadingComments: ['// first\n// second'] }],
    },
    {
      name: 'normalizes configured literal line endings for matching only',
      code: '// first\n// second\n/* Acme */\n\nexport {};\n',
      options: [{ template: '/* Acme */', allowedLeadingComments: ['// first\r\n// second\r\n'] }],
    },
    {
      name: 'does not split a completed prefix and header after insertion',
      code: '// @ts-check\n\n// Acme\n',
      options: [{ template: '// Acme', allowedLeadingComments: ['// @ts-check'] }],
    },
    {
      name: 'matches a complete multiline block with a regex',
      code: '/**\r\n * @jest-environment node\r\n */\r\n/* Acme */\r\n\r\nexport {};\r\n',
      options: [
        {
          template: '/* Acme */',
          allowedLeadingComments: [{ pattern: '/\\*\\*[\\s\\S]*@jest-environment node[\\s\\S]*\\*/' }],
        },
      ],
    },
    {
      name: 'prioritizes the required header over a broad allowlist',
      code: '/* Acme */\n\nexport {};\n',
      options: [{ template: '/* Acme */', allowedLeadingComments: [{ pattern: '[\\s\\S]*' }] }],
    },
    {
      name: 'recognizes a required header after a permitted directive',
      code: '// @ts-check\n/* Acme */\n\nexport {};\n',
      options: [{ template: '/* Acme */', allowedLeadingComments: ['// @ts-check'] }],
    },
  ],
  invalid: [
    ...[
      ['inserts after a line directive', '// @ts-check\nexport {};\n', '// @ts-check\n/* Acme */\n\nexport {};\n'],
      [
        'preserves indentation after a prefix',
        '/* pragma */\n  export {};\n',
        '/* pragma */\n  /* Acme */\n\n  export {};\n',
      ],
      [
        'keeps same-line whitespace before an inserted newline',
        '/* pragma */  export {};\n',
        '/* pragma */  \n/* Acme */\n\n  export {};\n',
      ],
      [
        'keeps existing prefix blank lines',
        '// @ts-check\n\n\nexport {};\n',
        '// @ts-check\n\n\n/* Acme */\n\nexport {};\n',
      ],
      ['handles a prefix-only file', '/* pragma */', '/* pragma */\n/* Acme */\n'],
      ['handles a line prefix ending at EOF', '// @ts-check', '// @ts-check\n/* Acme */\n'],
      ['preserves prefix-only trailing whitespace', '/* pragma */ \n\n  ', '/* pragma */ \n\n  /* Acme */\n'],
      [
        'preserves a BOM and CRLF',
        '\uFEFF// @ts-check\r\nexport {};\r\n',
        '\uFEFF// @ts-check\r\n/* Acme */\r\n\r\nexport {};\r\n',
      ],
      [
        'preserves a shebang before a prefix',
        '#!/usr/bin/env node\n/* pragma */\nexport {};\n',
        '#!/usr/bin/env node\n/* pragma */\n/* Acme */\n\nexport {};\n',
      ],
      [
        'stops at code before later permitted comments',
        'export {};\n/* pragma */\n',
        '/* Acme */\n\nexport {};\n/* pragma */\n',
      ],
    ].map(([name, code, output]) => ({
      name,
      code,
      output,
      options: [options],
      errors: [{ messageId: 'missing' }],
      recursive: true,
    })),
    ...[
      ['stops at an unknown first comment', '/** unknown */\n/* pragma */\nexport {};\n'],
      ['stops at an unknown comment after a prefix', '/* pragma */\n/** unknown */\nexport {};\n'],
      ['does not split consecutive line comments', '// @ts-check\n// unknown\nexport {};\n'],
    ].map(([name, code]) => ({ name, code, options: [options], errors: [{ messageId: 'mismatch' }], output: null })),
    {
      name: 'requires a full-comment regex match',
      code: '// @ts-check\nexport {};\n',
      options: [{ template: '/* Acme */', allowedLeadingComments: [{ pattern: '@ts-check' }] }],
      errors: [{ messageId: 'mismatch' }],
      output: null,
    },
    {
      name: 'does not use regex flags implicitly',
      code: '// @TS-CHECK\nexport {};\n',
      options: [{ template: '/* Acme */', allowedLeadingComments: [{ pattern: '// @ts-check' }] }],
      errors: [{ messageId: 'mismatch' }],
      output: null,
    },
    {
      name: 'preserves a prefix while normalizing header spacing',
      code: '/* pragma */  /* Acme */\nexport {};\n',
      options: [options],
      errors: [{ messageId: 'spacing' }],
      output: '/* pragma */  /* Acme */\n\nexport {};\n',
    },
    {
      name: 'repairs an existing header before considering a broad prefix regex',
      code: '/* Copyright 2001-2004 Other */\n\nexport {};\n',
      options: [
        {
          template: '/* Copyright {{years}} {{owner}} */',
          values: {
            years: { pattern: '\\d{4}(?:-\\d{4})?', replacement: '2026' },
            owner: { pattern: 'Acme', replacement: 'Acme' },
          },
          allowedLeadingComments: [{ pattern: '[\\s\\S]*' }],
        },
      ],
      errors: [{ messageId: 'invalidValue', data: { fields: 'owner' } }],
      output: '/* Copyright 2001-2004 Acme */\n\nexport {};\n',
    },
    {
      name: 'does not consume an ambiguous required header as an allowed prefix',
      code: '/* a :: b :: c */\n\nexport {};\n',
      options: [
        {
          template: '/* {{owner}} :: {{year}} */',
          values: { owner: { pattern: '.+', replacement: 'Acme' }, year: { pattern: '.+', replacement: '2026' } },
          allowedLeadingComments: [{ pattern: '[\\s\\S]*' }],
        },
      ],
      errors: [{ messageId: 'mismatch' }],
      output: null,
    },
    {
      name: 'keeps an inserted line header separate from a permitted line group at EOF',
      code: '// @ts-check',
      options: [{ template: '// Acme', allowedLeadingComments: ['// @ts-check'] }],
      errors: [{ messageId: 'missing' }],
      output: '// @ts-check\n\n// Acme\n',
      recursive: true,
    },
  ],
});

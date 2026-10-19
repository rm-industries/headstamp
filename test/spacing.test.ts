import { describe, it } from 'node:test';

import { RuleTester } from 'oxlint/plugins-dev';

import plugin from '../src/index.ts';

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester();
tester.run('configured header spacing', plugin.rules.header, {
  valid: [
    {
      name: 'keeps the default at one blank line',
      code: '/* Acme */\n\nexport {};\n',
      options: [{ template: '/* Acme */' }],
    },
    {
      name: 'accepts zero with no no-op fix',
      code: '// Acme\nexport {};\n',
      options: [{ template: '// Acme', blankLinesAfter: 0 }],
    },
    {
      name: 'accepts exactly three blank lines',
      code: '/* Acme */\n\n\n\nexport {};\n',
      options: [{ template: '/* Acme */', blankLinesAfter: 3 }],
    },
    {
      name: 'ignores the count in header-only files',
      code: '/* Acme */\n',
      options: [{ template: '/* Acme */', blankLinesAfter: 3 }],
    },
  ],
  invalid: [
    {
      name: 'still repairs fields when zero spacing would merge line comments',
      code: '// Owner: Other\n\n// User documentation\nexport {};\n',
      options: [
        {
          template: '// Owner: {{owner}}',
          blankLinesAfter: 0,
          values: { owner: { pattern: 'Acme', replacement: 'Acme' } },
        },
      ],
      errors: [{ messageId: 'unsafeSpacing' }, { messageId: 'invalidValue', data: { fields: 'owner' } }],
      output: '// Owner: Acme\n\n// User documentation\nexport {};\n',
      recursive: true,
    },
    {
      name: 'fixes fields and spacing while preserving valid historical values',
      code: '/* Copyright 2001-2004 Other */\nexport {};\n',
      options: [
        {
          template: '/* Copyright {{years}} {{owner}} */',
          blankLinesAfter: 2,
          values: {
            years: { pattern: '\\d{4}(?:-\\d{4})?', replacement: '2026' },
            owner: { pattern: 'Acme', replacement: 'Acme' },
          },
        },
      ],
      errors: [{ messageId: 'invalidValue', data: { fields: 'owner' } }],
      output: '/* Copyright 2001-2004 Acme */\n\n\nexport {};\n',
      recursive: true,
    },
    {
      name: 'fixes spacing while preserving an unfinished scaffold error',
      code: '/* Description: WIP */\nexport {};\n',
      options: [
        {
          template: '/* Description: {{description}} */',
          blankLinesAfter: 2,
          values: { description: { pattern: '\\S.{9,}', replacement: '' } },
        },
      ],
      errors: [{ messageId: 'spacing' }, { messageId: 'invalidValue', data: { fields: 'description' } }],
      output: '/* Description: WIP */\n\n\nexport {};\n',
      recursive: true,
    },
    {
      name: 'does not merge a line header into a later documentation group',
      code: '// Acme\n\n// User documentation\nexport {};\n',
      options: [{ template: '// Acme', blankLinesAfter: 0 }],
      errors: [{ messageId: 'unsafeSpacing' }],
      output: null,
    },
    ...(
      [
        ['inserts with zero empty lines', 'export {};\n', '/* Acme */', 0, '/* Acme */\nexport {};\n', 'missing'],
        [
          'adds three missing blank lines',
          '/* Acme */export {};\n',
          '/* Acme */',
          3,
          '/* Acme */\n\n\n\nexport {};\n',
          'spacing',
        ],
        [
          'removes excess blank lines',
          '/* Acme */\n\n\n\nexport {};\n',
          '/* Acme */',
          1,
          '/* Acme */\n\nexport {};\n',
          'spacing',
        ],
        [
          'preserves indentation and mixed body line endings',
          '/* Acme */\r\n  export {};\n',
          '/* Acme */',
          2,
          '/* Acme */\r\n\r\n\r\n  export {};\n',
          'spacing',
        ],
        ['preserves a BOM', '\uFEFFexport {};\r\n', '/* Acme */', 0, '\uFEFF/* Acme */\r\nexport {};\r\n', 'missing'],
        [
          'preserves a shebang',
          '#!/usr/bin/env node\nexport {};\n',
          '// Acme',
          2,
          '#!/usr/bin/env node\n// Acme\n\n\nexport {};\n',
          'missing',
        ],
        ['inserts into an empty file with one final newline', '', '/* Acme */', 3, '/* Acme */\n', 'missing'],
        ['normalizes a header-only file', '/* Acme */\n\n\n', '/* Acme */', 0, '/* Acme */\n', 'spacing'],
        [
          'keeps later block documentation',
          '// Acme\n\n/** User documentation */\nexport {};\n',
          '// Acme',
          0,
          '// Acme\n/** User documentation */\nexport {};\n',
          'spacing',
        ],
      ] as const
    ).map(([name, code, template, blankLinesAfter, output, messageId]) => ({
      name,
      code,
      options: [{ template, blankLinesAfter }],
      output,
      errors: [{ messageId }],
      recursive: true,
    })),
    {
      name: 'preserves prefix spacing while changing header spacing',
      code: '// @ts-check\n\n  /* Acme */\n\nexport {};\n',
      options: [{ template: '/* Acme */', blankLinesAfter: 0, allowedLeadingComments: ['// @ts-check'] }],
      errors: [{ messageId: 'spacing' }],
      output: '// @ts-check\n\n  /* Acme */\nexport {};\n',
    },
    {
      name: 'zero blank lines keeps source on the next line',
      code: '/* Acme */\n\nexport {};\n',
      options: [{ template: '/* Acme */', blankLinesAfter: 0 }],
      errors: [{ messageId: 'spacing' }],
      output: '/* Acme */\nexport {};\n',
    },
  ],
});

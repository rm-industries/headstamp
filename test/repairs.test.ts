import { describe, it } from 'node:test';

import { RuleTester } from 'oxlint/plugins-dev';

import plugin from '../src/index.ts';

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester();
tester.run('header field repairs', plugin.rules.header, {
  valid: [
    {
      name: 'does not replace valid values even when replacements differ',
      code: '/* Copyright 2001-2004 Other */\n\nexport {};\n',
      options: [
        {
          template: '/* Copyright {{years}} {{owner}} */',
          values: {
            years: { pattern: '\\d{4}(?:-\\d{4})?', replacement: '2026' },
            owner: { pattern: 'Acme|Other', replacement: 'Acme' },
          },
        },
      ],
    },
  ],
  invalid: [
    {
      name: 'preserves attempted input when the replacement is invalid',
      code: '// Description: WIP\n\nexport {};\n',
      options: [
        {
          template: '// Description: {{description}}',
          values: {
            description: { pattern: '.{10,}', replacement: '' },
          },
        },
      ],
      errors: [{ messageId: 'invalidValue', data: { fields: 'description' } }],
      output: null,
    },
    {
      name: 'requires a whole-value match for the replacement too',
      code: '// Owner: Other\n\nexport {};\n',
      options: [{ template: '// Owner: {{owner}}', values: { owner: { pattern: 'Acme', replacement: 'Acme extra' } } }],
      errors: [{ messageId: 'invalidValue', data: { fields: 'owner' } }],
      output: null,
    },
    {
      name: 'repairs independent fields while preserving unrepairable input',
      code: '// Owner: Other\n// Description: WIP\n\nexport {};\n',
      options: [
        {
          template: '// Owner: {{owner}}\n// Description: {{description}}',
          values: {
            owner: { pattern: 'Acme', replacement: 'Acme' },
            description: { pattern: '.{10,}', replacement: '' },
          },
        },
      ],
      errors: [
        { messageId: 'invalidValue', data: { fields: 'owner' } },
        { messageId: 'invalidValue', data: { fields: 'description' } },
      ],
      output: '// Owner: Acme\n// Description: WIP\n\nexport {};\n',
    },
    {
      name: 'repairs with literal dollar signs and backslashes',
      code: '// Owner: Other\n\nexport {};\n',
      options: [
        {
          template: '// Owner: {{owner}}',
          values: {
            owner: { pattern: '\\$& \\$\\$ \\$1 \\\\ Acme', replacement: '$& $$ $1 \\ Acme' },
          },
        },
      ],
      errors: [{ messageId: 'invalidValue', data: { fields: 'owner' } }],
      output: '// Owner: $& $$ $1 \\ Acme\n\nexport {};\n',
    },
    {
      name: 'preserves BOM, CRLF, indentation, and source during a block repair',
      code: '\uFEFF/* Year: 2020-2024; Owner: Other */\r\n  export const café = "🚀";\r\n',
      options: [
        {
          template: '/* Year: {{years}}; Owner: {{owner}} */',
          values: {
            years: { pattern: '\\d{4}(?:-\\d{4})?', replacement: '2026' },
            owner: { pattern: 'Acme 🚀', replacement: 'Acme 🚀' },
          },
        },
      ],
      errors: [{ messageId: 'invalidValue', data: { fields: 'owner' } }],
      output: '\uFEFF/* Year: 2020-2024; Owner: Acme 🚀 */\r\n\r\n  export const café = "🚀";\r\n',
    },
    {
      name: 'repairs a line header after a shebang without changing source code',
      code: '#!/usr/bin/env node\n// Owner: Other\nexport {};\n',
      options: [{ template: '// Owner: {{owner}}', values: { owner: { pattern: 'Acme', replacement: 'Acme' } } }],
      errors: [{ messageId: 'invalidValue', data: { fields: 'owner' } }],
      output: '#!/usr/bin/env node\n// Owner: Acme\n\nexport {};\n',
    },
    {
      name: 'normalizes a repaired header-only file to one final newline',
      code: '/* Owner: Other */\n\n',
      options: [{ template: '/* Owner: {{owner}} */', values: { owner: { pattern: 'Acme', replacement: 'Acme' } } }],
      errors: [{ messageId: 'invalidValue', data: { fields: 'owner' } }],
      output: '/* Owner: Acme */\n',
    },
    {
      name: 'does not replace documentation before a conflicting header',
      code: '/** User documentation */\n/* Owner: Other */\nexport {};\n',
      options: [{ template: '/* Owner: {{owner}} */', values: { owner: { pattern: 'Acme', replacement: 'Acme' } } }],
      errors: [{ messageId: 'mismatch' }],
      output: null,
    },
    {
      name: 'refuses a repair that would introduce ambiguous field boundaries',
      code: '/* Wrong :: Details */\n\nexport {};\n',
      options: [
        {
          template: '/* {{owner}} :: {{description}} */',
          values: {
            owner: { pattern: 'Acme(?: :: Inc)?', replacement: 'Acme :: Inc' },
            description: { pattern: '(?:\\d+|(?:Inc :: )?Details)', replacement: '123' },
          },
        },
      ],
      errors: [{ messageId: 'invalidValue', data: { fields: 'owner' } }],
      output: null,
    },
    {
      name: 'refuses a repair that would reassign preserved text to another field',
      code: '/* Wrong :: Other */\n\nexport {};\n',
      options: [
        {
          template: '/* {{owner}} :: {{description}} */',
          values: {
            owner: { pattern: 'Acme(?: :: Inc)?', replacement: 'Acme :: Inc' },
            description: { pattern: 'Inc :: Other', replacement: '' },
          },
        },
      ],
      errors: [{ messageId: 'invalidValue', data: { fields: 'owner, description' } }],
      output: null,
    },
    {
      name: 'repairs an owner while preserving a valid historical year range',
      code: '/* Copyright 2020-2024 Other */\n\nexport {};\n',
      options: [
        {
          template: '/* Copyright {{years}} {{owner}} */',
          values: {
            years: { pattern: '\\d{4}(?:-\\d{4})?', replacement: '2026' },
            owner: { pattern: 'Acme', replacement: 'Acme' },
          },
        },
      ],
      errors: [{ messageId: 'invalidValue', data: { fields: 'owner' } }],
      output: '/* Copyright 2020-2024 Acme */\n\nexport {};\n',
    },
  ],
});

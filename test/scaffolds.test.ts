import { describe, it } from 'node:test';

import { RuleTester } from 'oxlint/plugins-dev';

import plugin, { type HeaderOptions } from '../src/index.ts';

RuleTester.describe = describe;
RuleTester.it = it;

const header = {
  template: '// Owner: {{owner}}\n// Description: {{description}}',
  values: {
    owner: { pattern: 'Acme', replacement: 'Acme' },
    description: { pattern: '\\S.{9,}', replacement: '' },
  },
} satisfies HeaderOptions;

const tester = new RuleTester();
tester.run('incomplete header scaffolds', plugin.rules.header, {
  valid: [
    {
      name: 'passes after the user supplies a valid description',
      code: '// Owner: Acme\n// Description: Loads application settings.\n\nexport {};\n',
      options: [header],
    },
  ],
  invalid: [
    {
      name: 'repairs the owner without falsely reporting a completed human field',
      code: '// Owner: Other\n// Description: Loads application settings.\n\nexport {};\n',
      options: [header],
      errors: [{ messageId: 'invalidValue', data: { fields: 'owner' } }],
      output: '// Owner: Acme\n// Description: Loads application settings.\n\nexport {};\n',
    },
    {
      name: 'inserts a nonempty incomplete scaffold into an empty file',
      code: '',
      options: [
        {
          template: '/* Description: {{description}} */',
          values: { description: { pattern: '\\S.{9,}', replacement: 'TODO' } },
        },
      ],
      errors: [{ messageId: 'missing' }, { messageId: 'invalidValue', data: { fields: 'description' } }],
      output: '/* Description: TODO */\n',
    },
    ...['', 'WIP'].map((description) => ({
      name: `keeps unfinished description ${JSON.stringify(description)} without a no-op fix`,
      code: `// Owner: Acme\n// Description: ${description}\n\nexport {};\n`,
      options: [header],
      errors: [{ messageId: 'invalidValue', data: { fields: 'description' } }],
      output: null,
    })),
    {
      name: 'repairs an owner while retaining unfinished human input',
      code: '// Owner: Other\n// Description: WIP\n\nexport {};\n',
      options: [header],
      errors: [
        { messageId: 'invalidValue', data: { fields: 'owner' } },
        { messageId: 'invalidValue', data: { fields: 'description' } },
      ],
      output: '// Owner: Acme\n// Description: WIP\n\nexport {};\n',
    },
    {
      name: 'does not replace attempted input with an invalid nonempty scaffold',
      code: '/* Description: WIP */\n\nexport {};\n',
      options: [
        {
          template: '/* Description: {{description}} */',
          values: { description: { pattern: '\\S.{9,}', replacement: 'TODO' } },
        },
      ],
      errors: [{ messageId: 'invalidValue', data: { fields: 'description' } }],
      output: null,
    },
    {
      name: 'inserts an intentionally empty required description',
      code: 'export {};\n',
      options: [
        {
          template: '// Description: {{description}}',
          values: { description: { pattern: '\\S.*', replacement: '' } },
        },
      ],
      errors: [{ messageId: 'missing' }, { messageId: 'invalidValue', data: { fields: 'description' } }],
      output: '// Description: \n\nexport {};\n',
    },
  ],
});

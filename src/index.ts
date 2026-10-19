import type { RuleTester } from 'oxlint/plugins-dev';

import { prepareHeader } from './template.ts';

export type { HeaderOptions, HeaderValue } from './template.ts';

type Rule = Parameters<RuleTester['run']>[1];

const header: Rule = {
  meta: {
    type: 'layout',
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          template: { type: 'string' },
          values: {
            type: 'object',
            additionalProperties: {
              type: 'object',
              properties: { pattern: { type: 'string' }, replacement: { type: 'string' } },
              required: ['pattern', 'replacement'],
              additionalProperties: false,
            },
          },
        },
        required: ['template'],
        additionalProperties: false,
      },
    ],
    messages: {
      missing: 'Missing required header.',
      mismatch: 'Opening comment does not match the required header; review it manually.',
      spacing: 'Normalize spacing around the required header.',
      invalidValue: 'Header field(s) {{fields}} do not match their patterns; review them manually.',
    },
  },
  createOnce(context) {
    const templates = new Map<string, ReturnType<typeof prepareHeader>>();
    return {
      Program(node) {
        const hasOneOptionsArgument = context.options.length === 1;
        if (!hasOneOptionsArgument) throw new Error('Headstamp requires exactly one options object.');
        const optionsKey = JSON.stringify(context.options);
        let prepared = templates.get(optionsKey);
        if (prepared === undefined) {
          prepared = prepareHeader(context.options[0]);
          templates.set(optionsKey, prepared);
        }
        let headerText = prepared.rendered;
        const source = context.sourceCode;
        const text = source.text;
        const eol = /\r\n|\n/.exec(text)?.[0] ?? '\n';
        const shebang = /^#![^\r\n]*(?:\r\n|\n|$)/.exec(text)?.[0] ?? '';
        const anchor = shebang.length;
        const start = anchor + /^\s*/.exec(text.slice(anchor))![0].length;
        const comments = source.getAllComments();
        const first = comments.find((comment) => comment.range[0] === start);
        let end = anchor;
        if (first) {
          end = first.range[1];
          if (first.type === 'Line') {
            for (const comment of comments) {
              if (comment.range[0] < end) continue;
              const isLineComment = comment.type === 'Line';
              const followsOnNextLine = /^(?:\r\n|\n)[\t ]*$/.test(text.slice(end, comment.range[0]));
              if (!isLineComment || !followsOnNextLine) break;
              end = comment.range[1];
            }
          }
          headerText = text.slice(start, end).replace(/\r\n/g, '\n');
          const invalidFields = prepared.validate(headerText);
          if (invalidFields === null) {
            context.report({ node, messageId: 'mismatch' });
            return;
          }
          if (invalidFields.length > 0) {
            context.report({ node, messageId: 'invalidValue', data: { fields: invalidFields.join(', ') } });
            return;
          }
        }
        const whitespace = /^\s*/.exec(text.slice(end))![0];
        const contentStart = end + whitespace.length;
        const hasContent = contentStart < text.length;
        const indent = hasContent ? whitespace.slice(whitespace.lastIndexOf('\n') + 1) : '';
        const needsShebangNewline = shebang.length > 0 && !shebang.endsWith('\n');
        const prefix = needsShebangNewline ? eol : '';
        const replacement = prefix + headerText.replace(/\n/g, eol) + eol + (hasContent ? eol + indent : '');
        if (text.slice(anchor, contentStart) === replacement) return;
        context.report({
          node,
          messageId: first ? 'spacing' : 'missing',
          fix: (fixer) => fixer.replaceTextRange([anchor, contentStart], replacement),
        });
      },
    };
  },
};

const plugin: { meta: { name: string }; rules: { header: Rule } } = {
  meta: { name: '@rm-industries/oxlint-plugin-headstamp' },
  rules: { header },
};

export default plugin;

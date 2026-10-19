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
          blankLinesAfter: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
          allowedLeadingComments: {
            type: 'array',
            items: {
              anyOf: [
                { type: 'string' },
                {
                  type: 'object',
                  properties: { pattern: { type: 'string' } },
                  required: ['pattern'],
                  additionalProperties: false,
                },
              ],
            },
          },
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
      unsafeSpacing:
        'Zero blank lines would merge the header with following line comments; use a block header or at least one blank line.',
      invalidValue: 'Header field(s) {{fields}} do not match their patterns.',
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
        let invalidFields: string[] = [];
        let hasFieldRepairs = false;
        const source = context.sourceCode;
        const text = source.text;
        const eol = /\r\n|\n/.exec(text)?.[0] ?? '\n';
        const shebang = /^#![^\r\n]*(?:\r\n|\n|$)/.exec(text)?.[0] ?? '';
        let anchor = shebang.length;
        let start = anchor + /^\s*/.exec(text.slice(anchor))![0].length;
        const comments = source.getAllComments();
        let commentIndex = comments.findIndex((comment) => comment.range[0] === start);
        let first = commentIndex < 0 ? undefined : comments[commentIndex];
        let end = anchor;
        let hasLeadingComments = false;
        let prefixWhitespace = '';
        let lastLeadingCommentIsLine = false;
        while (first) {
          end = first.range[1];
          if (first.type === 'Line') {
            for (let nextIndex = commentIndex + 1; nextIndex < comments.length; nextIndex++) {
              const comment = comments[nextIndex];
              const isLineComment = comment.type === 'Line';
              const followsOnNextLine = /^(?:\r\n|\n)[\t ]*$/.test(text.slice(end, comment.range[0]));
              if (!isLineComment || !followsOnNextLine) break;
              end = comment.range[1];
              commentIndex = nextIndex;
            }
          }
          headerText = text.slice(start, end).replace(/\r\n/g, '\n');
          const inspection = prepared.inspect(headerText);
          if (inspection === null && prepared.isAllowedLeadingComment(headerText)) {
            hasLeadingComments = true;
            lastLeadingCommentIsLine = first.type === 'Line';
            prefixWhitespace = /^\s*/.exec(text.slice(end))![0];
            anchor = end + prefixWhitespace.length;
            start = anchor;
            end = anchor;
            first = comments[++commentIndex];
            if (first?.range[0] !== start) first = undefined;
            headerText = prepared.rendered;
            continue;
          }
          if (inspection === null || inspection === 'ambiguous') {
            context.report({ node, messageId: 'mismatch' });
            return;
          }
          invalidFields = inspection.invalidFields;
          hasFieldRepairs = inspection.repaired !== headerText;
          headerText = inspection.repaired;
          break;
        }
        const whitespace = /^\s*/.exec(text.slice(end))![0];
        const contentStart = end + whitespace.length;
        const hasContent = contentStart < text.length;
        const sourceWhitespace = hasLeadingComments && !first ? prefixWhitespace : whitespace;
        const indent = hasContent ? sourceWhitespace.slice(sourceWhitespace.lastIndexOf('\n') + 1) : '';
        const needsShebangNewline = shebang.length > 0 && !shebang.endsWith('\n');
        let prefix = needsShebangNewline ? eol : '';
        if (hasLeadingComments && !first) {
          // A blank line prevents two line-comment groups from merging on the next lint run.
          const needsLineGroupBoundary = lastLeadingCommentIsLine && headerText.startsWith('//');
          const requiredNewlines = needsLineGroupBoundary ? 2 : 1;
          const existingNewlines = prefixWhitespace.match(/\n/g)?.length ?? 0;
          prefix = eol.repeat(Math.max(0, requiredNewlines - existingNewlines));
        }
        const wouldMergeLineGroups =
          first?.type === 'Line' && prepared.blankLinesAfter === 0 && text.startsWith('//', contentStart);
        if (wouldMergeLineGroups) context.report({ node, messageId: 'unsafeSpacing' });
        const separator = wouldMergeLineGroups
          ? whitespace
          : eol + (hasContent ? eol.repeat(prepared.blankLinesAfter) + indent : '');
        const replacement = prefix + headerText.replace(/\n/g, eol) + separator;
        let remainingInvalidFields = prepared.invalidReplacementFields;
        if (first) {
          remainingInvalidFields = hasFieldRepairs
            ? invalidFields.filter((name) => prepared.invalidReplacementFields.includes(name))
            : invalidFields;
        }
        const repairedFields = invalidFields.filter((name) => !remainingInvalidFields.includes(name));
        const hasChanges = text.slice(anchor, contentStart) !== replacement;
        if (hasChanges) {
          let messageId = first ? 'spacing' : 'missing';
          if (repairedFields.length > 0) messageId = 'invalidValue';
          context.report({
            node,
            messageId,
            data: { fields: repairedFields.join(', ') },
            fix: (fixer) => fixer.replaceTextRange([anchor, contentStart], replacement),
          });
        }
        // Oxlint removes fixed diagnostics without re-linting; retain errors needing human input.
        if (remainingInvalidFields.length > 0) {
          context.report({ node, messageId: 'invalidValue', data: { fields: remainingInvalidFields.join(', ') } });
        }
      },
    };
  },
};

const plugin: { meta: { name: string }; rules: { header: Rule } } = {
  meta: { name: '@rm-industries/oxlint-plugin-headstamp' },
  rules: { header },
};

export default plugin;

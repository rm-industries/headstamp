import type { RuleTester } from 'oxlint/plugins-dev';

export interface HeaderOptions {
  template: string;
}

type Rule = Parameters<RuleTester['run']>[1];

const header: Rule = {
  meta: {
    type: 'layout',
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: { template: { type: 'string' } },
        required: ['template'],
        additionalProperties: false,
      },
    ],
    messages: {
      missing: 'Missing required header.',
      mismatch: 'Opening comment does not match the required header; review it manually.',
      spacing: 'Normalize spacing around the required header.',
    },
  },
  createOnce(context) {
    const templates = new Map<string, string>();
    return {
      Program(node) {
        const options = context.options[0];
        const hasOneOptionsArgument = context.options.length === 1;
        const isOptionsObject = hasOneOptionsArgument && options !== null && typeof options === 'object';
        const configuredTemplate = isOptionsObject && 'template' in options ? options.template : undefined;
        const hasTemplateString = typeof configuredTemplate === 'string';
        const hasOnlyTemplateOption = hasTemplateString && isOptionsObject && Object.keys(options).length === 1;
        if (!hasTemplateString || !hasOnlyTemplateOption) {
          throw new Error('Headstamp requires a template string.');
        }
        let template = templates.get(configuredTemplate);
        if (template === undefined) {
          template = configuredTemplate.replace(/\r\n/g, '\n').replace(/\n+$/, '');
          const isBlockComment =
            template.length >= 4 && template.startsWith('/*') && template.indexOf('*/') === template.length - 2;
          const isLineCommentGroup = template.split('\n').every((line) => line.startsWith('//'));
          const hasSupportedCommentStyle = isBlockComment || isLineCommentGroup;
          const hasUnsupportedLineEndings = /[\r\u2028\u2029]/.test(template);
          if (!hasSupportedCommentStyle || hasUnsupportedLineEndings) {
            throw new Error(
              'Headstamp template must be one complete block comment or consecutive // comments using LF or CRLF.',
            );
          }
          templates.set(configuredTemplate, template);
        }
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
          if (text.slice(start, end).replace(/\r\n/g, '\n') !== template) {
            context.report({ node, messageId: 'mismatch' });
            return;
          }
        }
        const whitespace = /^\s*/.exec(text.slice(end))![0];
        const contentStart = end + whitespace.length;
        const hasContent = contentStart < text.length;
        const indent = hasContent ? whitespace.slice(whitespace.lastIndexOf('\n') + 1) : '';
        const needsShebangNewline = shebang.length > 0 && !shebang.endsWith('\n');
        const prefix = needsShebangNewline ? eol : '';
        const replacement = prefix + template.replace(/\n/g, eol) + eol + (hasContent ? eol + indent : '');
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

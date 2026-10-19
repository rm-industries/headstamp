import type { RuleTester } from 'oxlint/plugins-dev';

type Rule = Parameters<RuleTester['run']>[1];
const boundary: Rule = {
  meta: { schema: [{ type: 'boolean' }], fixable: 'code' },
  createOnce(context) {
    return {
      Program(node) {
        const text = context.sourceCode.text;
        context.report({
          node,
          message:
            'HEADSTAMP_PROBE:' +
            JSON.stringify({
              text,
              getText: context.sourceCode.getText(),
              filename: context.filename,
              physicalFilename: context.physicalFilename,
              range: node.range,
              comments: context.sourceCode.getAllComments().map(({ range }) => range),
            }),
          fix:
            context.options[0] === true && !text.startsWith('/* PROBE */')
              ? (fixer) => fixer.insertTextBeforeRange([0, 0], '/* PROBE */\n')
              : undefined,
        });
      },
    };
  },
};
const plugin: { meta: { name: string }; rules: { boundary: Rule } } = {
  meta: { name: 'headstamp-framework-probe' },
  rules: { boundary },
};
export default plugin;

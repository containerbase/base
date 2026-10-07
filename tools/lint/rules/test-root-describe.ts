import { defineRule } from '@oxlint/plugins';

export default defineRule({
  meta: {
    type: 'suggestion',
    fixable: 'code',
    messages: {
      missingArguments: 'Test root describe must have arguments',
      wrongName: "Test must be described by this string: '{{testName}}'",
    },
  },
  create(context) {
    const absoluteFileName = context.filename;
    if (!/\.spec\.[cm]?tsx?$/.test(absoluteFileName)) {
      return {};
    }
    const relativeFileName = absoluteFileName
      .replace(context.cwd, '')
      .replace(/\\/g, '/')
      .replace(/^(?:\/(?:lib|src|test))?\//, '');
    const testName = relativeFileName.replace(/\.spec\.[cm]?tsx?$/, '');
    return {
      CallExpression(node) {
        const { callee } = node;
        if (callee.type !== 'Identifier' || callee.name !== 'describe') {
          return;
        }
        if (node.parent.parent?.type !== 'Program') {
          return;
        }

        const [descr] = node.arguments;
        if (!descr) {
          context.report({ node, messageId: 'missingArguments' });
          return;
        }

        if (descr.type === 'Literal' && descr.value === testName) {
          return;
        }

        context.report({
          node: descr,
          messageId: 'wrongName',
          data: { testName },
          fix: (fixer) => fixer.replaceText(descr, `'${testName}'`),
        });
      },
    };
  },
});

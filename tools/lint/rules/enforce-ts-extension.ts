import { type Context, type ESTree, defineRule } from '@oxlint/plugins';

const viMethods = new Set([
  'mock',
  'doMock',
  'unmock',
  'doUnmock',
  'importActual',
  'importMock',
]);

/**
 * Checks whether a module specifier points to a local file.
 * @param value the module specifier
 * @returns whether it is a relative or `~` aliased path
 */
function isLocalPath(value: string): boolean {
  return value.startsWith('.') || value.startsWith('~');
}

/**
 * Checks whether the last path segment has a file extension.
 * @param value the module specifier
 * @returns whether the file name has an extension
 */
function hasExtension(value: string): boolean {
  const basename = value.slice(value.lastIndexOf('/') + 1);
  const dotIndex = basename.lastIndexOf('.');
  return dotIndex > 0 && dotIndex < basename.length - 1;
}

/**
 * Reports a local `.js` specifier and fixes it to `.ts`.
 * @param context the rule context
 * @param node the module specifier literal
 */
function reportJsExtension(context: Context, node: ESTree.StringLiteral): void {
  const quote = node.raw?.[0] ?? "'";
  const fixed = `${node.value.slice(0, -3)}.ts`;
  context.report({
    node,
    messageId: 'useTsExtension',
    fix: (fixer) => fixer.replaceText(node, `${quote}${fixed}${quote}`),
  });
}

/**
 * Checks the module specifier of an import or export.
 * @param context the rule context
 * @param node the module specifier literal
 */
function checkSource(
  context: Context,
  node: ESTree.StringLiteral | null | undefined,
): void {
  if (node && isLocalPath(node.value) && node.value.endsWith('.js')) {
    reportJsExtension(context, node);
  }
}

export default defineRule({
  meta: {
    type: 'problem',
    fixable: 'code',
    messages: {
      useTsExtension: 'Use ".ts" extension instead of ".js" for local imports',
      missingExtension: 'Missing file extension on local import',
    },
  },
  create(context) {
    if (!/\.[cm]?tsx?$/.test(context.filename)) {
      // not a TypeScript file, ignore
      return {};
    }
    return {
      ImportDeclaration(node) {
        checkSource(context, node.source);
      },
      ExportNamedDeclaration(node) {
        checkSource(context, node.source);
      },
      ExportAllDeclaration(node) {
        checkSource(context, node.source);
      },
      ImportExpression(node) {
        if (
          node.source.type === 'Literal' &&
          typeof node.source.value === 'string'
        ) {
          checkSource(context, node.source);
        }
      },
      CallExpression(node) {
        const { callee } = node;
        if (
          callee.type !== 'MemberExpression' ||
          callee.object.type !== 'Identifier' ||
          callee.object.name !== 'vi' ||
          callee.property.type !== 'Identifier' ||
          !viMethods.has(callee.property.name)
        ) {
          return;
        }
        const [arg] = node.arguments;
        if (
          arg?.type !== 'Literal' ||
          typeof arg.value !== 'string' ||
          !isLocalPath(arg.value)
        ) {
          return;
        }
        if (arg.value.endsWith('.js')) {
          reportJsExtension(context, arg);
        } else if (!hasExtension(arg.value)) {
          context.report({ node: arg, messageId: 'missingExtension' });
        }
      },
    };
  },
});

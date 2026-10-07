import { defineRule } from '@oxlint/plugins';

/**
 * Same check as the `PascalCase` format of `@typescript-eslint/naming-convention`.
 * @param name the enum member name
 * @returns whether the name starts upper case and has no underscore
 */
function isPascalCase(name: string): boolean {
  return name.startsWith(name.charAt(0).toUpperCase()) && !name.includes('_');
}

export default defineRule({
  meta: {
    type: 'suggestion',
    messages: {
      enumMemberPascalCase: "Enum member '{{name}}' must be in PascalCase.",
    },
  },
  createOnce(context) {
    return {
      TSEnumMember(node) {
        const { id } = node;
        // template literal members are rare, leave them unchecked
        if (id.type === 'TemplateLiteral') {
          return;
        }
        const name = id.type === 'Identifier' ? id.name : id.value;
        if (isPascalCase(name)) {
          return;
        }
        context.report({
          node: id,
          messageId: 'enumMemberPascalCase',
          data: { name },
        });
      },
    };
  },
});

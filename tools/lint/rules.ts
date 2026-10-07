import { definePlugin } from '@oxlint/plugins';
import enforceTsExtension from './rules/enforce-ts-extension.ts';
import enumMemberPascalCase from './rules/enum-member-pascal-case.ts';
import noUndeclaredDependencies from './rules/no-undeclared-dependencies.ts';
import organizeImports from './rules/organize-imports.ts';
import testRootDescribe from './rules/test-root-describe.ts';

export default definePlugin({
  meta: {
    name: 'containerbase-local',
  },
  rules: {
    'enforce-ts-extension': enforceTsExtension,
    'enum-member-pascal-case': enumMemberPascalCase,
    'no-undeclared-dependencies': noUndeclaredDependencies,
    'organize-imports': organizeImports,
    'test-root-describe': testRootDescribe,
  },
});

import { join } from 'node:path';
import { RuleTester } from 'oxlint/plugins-dev';
import { describe, test } from 'vitest';
import rule from './no-undeclared-dependencies.ts';

RuleTester.describe = describe;
RuleTester.it = test;

const ruleTester = new RuleTester({
  languageOptions: { parserOptions: { lang: 'ts' } },
});

// the rule reads the nearest package.json above the linted file
const filename = join(
  import.meta.dirname,
  '__fixtures__/no-undeclared-dependencies/src/file.ts',
);

ruleTester.run('no-undeclared-dependencies', rule, {
  valid: [
    { code: `import a from 'runtime-dep';`, filename },
    { code: `import a from 'runtime-dep/sub/path';`, filename },
    { code: `import a from '@scope/runtime/sub';`, filename },
    { code: `import a from 'peer-dep';`, filename },
    { code: `import a from 'optional-dep';`, filename },
    // the package may import itself
    { code: `import a from 'fixture-package';`, filename },
    { code: `import fs from 'node:fs';`, filename },
    { code: `import fs from 'fs/promises';`, filename },
    { code: `import a from './local.ts';`, filename },
    { code: `import a from '~test/path.ts';`, filename },
    // type-only imports are erased at runtime
    { code: `import type { A } from 'undeclared';`, filename },
    { code: `export type { A } from 'undeclared';`, filename },
    {
      code: `import a from 'dev-dep';`,
      filename,
      options: [{ allowDevDependencies: true }],
    },
    // a non-literal dynamic import can't be checked
    { code: `await import(name);`, filename },
  ],
  invalid: [
    {
      code: `import a from 'undeclared';`,
      filename,
      errors: [{ messageId: 'undeclared', data: { name: 'undeclared' } }],
    },
    {
      code: `import a from '@scope/undeclared/sub';`,
      filename,
      errors: [
        { messageId: 'undeclared', data: { name: '@scope/undeclared' } },
      ],
    },
    {
      code: `import a from 'dev-dep';`,
      filename,
      errors: [{ messageId: 'devOnly', data: { name: 'dev-dep' } }],
    },
    {
      code: `import a from 'undeclared';`,
      filename,
      options: [{ allowDevDependencies: true }],
      errors: [{ messageId: 'undeclared', data: { name: 'undeclared' } }],
    },
    {
      code: `export { a } from 'undeclared';`,
      filename,
      errors: [{ messageId: 'undeclared', data: { name: 'undeclared' } }],
    },
    {
      code: `export * from 'undeclared';`,
      filename,
      errors: [{ messageId: 'undeclared', data: { name: 'undeclared' } }],
    },
    {
      code: `await import('undeclared');`,
      filename,
      errors: [{ messageId: 'undeclared', data: { name: 'undeclared' } }],
    },
  ],
});

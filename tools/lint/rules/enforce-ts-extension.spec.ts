import { RuleTester } from 'oxlint/plugins-dev';
import { describe, test } from 'vitest';
import rule from './enforce-ts-extension.ts';

RuleTester.describe = describe;
RuleTester.it = test;

const ruleTester = new RuleTester({
  languageOptions: { parserOptions: { lang: 'ts' } },
});

const filename = 'src/file.ts';

ruleTester.run('enforce-ts-extension', rule, {
  valid: [
    { code: `import a from './a.ts';`, filename },
    { code: `import a from 'package/file.js';`, filename },
    { code: `export * from './a.ts';`, filename },
    { code: `await import('./a.ts');`, filename },
    { code: `vi.mock('./a.ts');`, filename },
    { code: `vi.mock('execa');`, filename },
    { code: `other.mock('./a');`, filename },
    // plain javascript files are not checked
    { code: `import a from './a.js';`, filename: 'src/file.js' },
  ],
  invalid: [
    {
      code: `import a from './a.js';`,
      filename,
      output: `import a from './a.ts';`,
      errors: [{ messageId: 'useTsExtension' }],
    },
    {
      code: `import a from "~test/a.js";`,
      filename,
      output: `import a from "~test/a.ts";`,
      errors: [{ messageId: 'useTsExtension' }],
    },
    {
      code: `export { a } from '../a.js';`,
      filename,
      output: `export { a } from '../a.ts';`,
      errors: [{ messageId: 'useTsExtension' }],
    },
    {
      code: `export * from './a.js';`,
      filename,
      output: `export * from './a.ts';`,
      errors: [{ messageId: 'useTsExtension' }],
    },
    {
      code: `await import('./a.js');`,
      filename,
      output: `await import('./a.ts');`,
      errors: [{ messageId: 'useTsExtension' }],
    },
    {
      code: `vi.mock('./a.js');`,
      filename,
      output: `vi.mock('./a.ts');`,
      errors: [{ messageId: 'useTsExtension' }],
    },
    {
      code: `vi.importActual('./a');`,
      filename,
      output: null,
      errors: [{ messageId: 'missingExtension' }],
    },
  ],
});

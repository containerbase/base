import { RuleTester } from 'oxlint/plugins-dev';
import { describe, test } from 'vitest';
import rule from './test-root-describe.ts';

RuleTester.describe = describe;
RuleTester.it = test;

const ruleTester = new RuleTester({
  languageOptions: { parserOptions: { lang: 'ts' } },
  cwd: '/repo',
});

const filename = '/repo/src/cli/utils/file.spec.ts';

ruleTester.run('test-root-describe', rule, {
  valid: [
    { code: `describe('cli/utils/file', () => {});`, filename },
    // nested describes may use any name
    {
      code: `describe('cli/utils/file', () => { describe('other', () => {}); });`,
      filename,
    },
    // only spec files are checked
    {
      code: `describe('other', () => {});`,
      filename: '/repo/src/cli/utils/file.ts',
    },
    {
      code: `describe('tools/file', () => {});`,
      filename: '/repo/tools/file.spec.ts',
    },
  ],
  invalid: [
    {
      code: `describe('other', () => {});`,
      filename,
      output: `describe('cli/utils/file', () => {});`,
      errors: [
        { messageId: 'wrongName', data: { testName: 'cli/utils/file' } },
      ],
    },
    {
      code: 'describe(`cli/utils/file`, () => {});',
      filename,
      output: `describe('cli/utils/file', () => {});`,
      errors: [{ messageId: 'wrongName' }],
    },
    {
      code: `describe();`,
      filename,
      output: null,
      errors: [{ messageId: 'missingArguments' }],
    },
  ],
});

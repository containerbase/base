import { RuleTester } from 'oxlint/plugins-dev';
import { describe, test } from 'vitest';
import rule from './enum-member-pascal-case.ts';

RuleTester.describe = describe;
RuleTester.it = test;

const ruleTester = new RuleTester({
  languageOptions: { parserOptions: { lang: 'ts' } },
});

ruleTester.run('enum-member-pascal-case', rule, {
  valid: [
    `enum Color { Red, DarkBlue }`,
    `enum Level { Debug = 'debug', Info = 'info' }`,
    // quoted members are checked by their value
    `enum Quoted { 'Value' = 1 }`,
    // digits are fine after the first letter
    `enum Version { V2, Ipv6 }`,
    // template literal members are not checked
    'enum Template { [`some_value`] = 1 }',
  ],
  invalid: [
    {
      code: `enum Color { red }`,
      errors: [{ messageId: 'enumMemberPascalCase', data: { name: 'red' } }],
    },
    {
      code: `enum Color { DARK_BLUE }`,
      errors: [
        { messageId: 'enumMemberPascalCase', data: { name: 'DARK_BLUE' } },
      ],
    },
    {
      code: `enum Quoted { 'some-value' = 1 }`,
      errors: [
        { messageId: 'enumMemberPascalCase', data: { name: 'some-value' } },
      ],
    },
  ],
});

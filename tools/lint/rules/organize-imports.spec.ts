import { codeBlock } from 'common-tags';
import { RuleTester } from 'oxlint/plugins-dev';
import { describe, test } from 'vitest';
import rule from './organize-imports.ts';

RuleTester.describe = describe;
RuleTester.it = test;

const ruleTester = new RuleTester({
  languageOptions: { parserOptions: { lang: 'ts' } },
});

ruleTester.run('organize-imports', rule, {
  valid: [
    codeBlock`
      import fs from 'node:fs';
      import path from 'path';
      import { z } from 'zod';
      import a from '../a.ts';
      import b from './b.ts';
      import c from '.';
      import d from '~test/d.ts';
    `,
    // side-effect imports keep their place and split the imports around them
    codeBlock`
      import b from 'b';
      import 'setup';
      import a from 'a';
    `,
    // other statements split the imports too
    codeBlock`
      import b from 'b';
      const x = 1;
      import a from 'a';
    `,
    // upper case sorts before lower case
    codeBlock`
      import A from 'Zed';
      import a from 'alpha';
    `,
  ],
  invalid: [
    {
      code: codeBlock`
        import b from 'b';
        import a from 'a';
      `,
      output: codeBlock`
        import a from 'a';
        import b from 'b';
      `,
      errors: [{ messageId: 'unsorted', data: { source: 'b' } }],
    },
    {
      // groups win over the alphabetical order
      code: codeBlock`
        import b from './b.ts';
        import a from '../a.ts';
        import z from 'zod';
        import fs from 'node:fs';
      `,
      output: codeBlock`
        import fs from 'node:fs';
        import z from 'zod';
        import a from '../a.ts';
        import b from './b.ts';
      `,
      errors: [{ messageId: 'unsorted', data: { source: './b.ts' } }],
    },
    {
      // comments move with their import
      code: codeBlock`
        import fs from 'node:fs';
        import c from 'c'; // trailing
        // leading
        import a from 'a';
        import {
          b1,
          b2,
        } from 'b';
      `,
      output: codeBlock`
        import fs from 'node:fs';
        // leading
        import a from 'a';
        import {
          b1,
          b2,
        } from 'b';
        import c from 'c'; // trailing
      `,
      errors: [{ messageId: 'unsorted', data: { source: 'c' } }],
    },
    {
      // the code after the imports is kept
      code: codeBlock`
        import b from 'b';
        import a from 'a';

        export const x = a + b;
      `,
      output: codeBlock`
        import a from 'a';
        import b from 'b';

        export const x = a + b;
      `,
      errors: [{ messageId: 'unsorted', data: { source: 'b' } }],
    },
    {
      // a comment above the first import may be a file header, so no fix
      code: codeBlock`
        // header
        import b from 'b';
        import a from 'a';
      `,
      output: null,
      errors: [{ messageId: 'unsorted', data: { source: 'b' } }],
    },
    {
      // imports sharing a line are not fixed
      code: `import b from 'b'; import a from 'a';`,
      output: null,
      errors: [{ messageId: 'unsorted', data: { source: 'b' } }],
    },
  ],
});

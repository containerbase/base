import { describe, expectTypeOf, test } from 'vitest';
import type { z } from 'zod';
import type {
  InstallToolType,
  ToolMetadata,
} from '../../packages/base/src/schema.ts';
import type * as types from '../../packages/base/src/types.ts';

// type-only checks, `tsc` fails when the zod schemas of the base package and
// its zod free types drift apart
describe('packages/base', () => {
  test('InstallToolType matches the zod free type', () => {
    expectTypeOf<
      z.infer<typeof InstallToolType>
    >().toEqualTypeOf<types.InstallToolType>();
  });

  test('ToolMetadata matches the zod free interface', () => {
    expectTypeOf<
      z.infer<typeof ToolMetadata>
    >().toEqualTypeOf<types.ToolMetadata>();
  });
});

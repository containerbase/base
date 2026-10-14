import { describe, expect, expectTypeOf, test } from 'vitest';
import type { z } from 'zod';
import { tools } from '../../packages/base/src/data.ts';
import { toolNames } from '../../packages/base/src/index.ts';
import {
  type InstallToolType,
  ToolMetadata,
  type ToolType,
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

  test('ToolType matches the zod free type', () => {
    expectTypeOf<z.infer<typeof ToolType>>().toEqualTypeOf<types.ToolType>();
  });

  test('ToolMetadata accepts the package managers', () => {
    for (const type of ['gem', 'npm', 'pip', 'dotnet']) {
      expect(ToolMetadata.safeParse({ type }).success).toBe(true);
    }
    expect(ToolMetadata.safeParse({ type: 'apt' }).success).toBe(false);
  });

  test('ToolMetadata accepts a minimum version only as string', () => {
    expect(ToolMetadata.safeParse({ minVersion: '2.33.0' }).success).toBe(true);
    expect(ToolMetadata.safeParse({ minVersion: 2 }).success).toBe(false);
  });

  test('tools have the minimum versions of their install services', () => {
    // the values are defined in the install services, see `listSupportedTools`
    const entries: [string, types.ToolMetadata][] = Object.entries(tools);
    expect(
      entries.flatMap(([name, { minVersion }]) =>
        minVersion ? [[name, minVersion]] : [],
      ),
    ).toEqual([
      ['git', '2.33.0'],
      ['nix', '2.10.3'],
      ['vp', '0.3.1'],
    ]);
  });

  test('ToolMetadata matches the zod free interface', () => {
    expectTypeOf<
      z.infer<typeof ToolMetadata>
    >().toEqualTypeOf<types.ToolMetadata>();
  });

  test('tools are sorted alphabetically', () => {
    // same order as `listSupportedTools`, which generates the data
    expect(toolNames).toEqual(
      toolNames.toSorted((a, b) => a.localeCompare(b, 'en', { numeric: true })),
    );
  });
});

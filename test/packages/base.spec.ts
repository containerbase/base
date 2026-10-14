import { describe, expect, expectTypeOf, test } from 'vitest';
import type { z } from 'zod';
import { tools } from '../../packages/base/src/data.ts';
import { toolNames } from '../../packages/base/src/index.ts';
import {
  DistroCode,
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

  test('DistroCode matches the zod free type', () => {
    expectTypeOf<
      z.infer<typeof DistroCode>
    >().toEqualTypeOf<types.DistroCode>();
  });

  test('ToolMetadata accepts a minimum version per Ubuntu release', () => {
    expect(
      ToolMetadata.safeParse({ distroMinVersion: { resolute: '8.1.31' } })
        .success,
    ).toBe(true);
    expect(ToolMetadata.safeParse({ distroMinVersion: {} }).success).toBe(true);
    expect(
      ToolMetadata.safeParse({ distroMinVersion: { focal: '1.0.0' } }).success,
    ).toBe(false);
    expect(
      ToolMetadata.safeParse({ distroMinVersion: { noble: 1 } }).success,
    ).toBe(false);
  });

  test('tools have the minimum versions per Ubuntu release of their install services', () => {
    const entries: [string, types.ToolMetadata][] = Object.entries(tools);
    expect(
      entries.flatMap(([name, { distroMinVersion }]) =>
        distroMinVersion ? [[name, distroMinVersion]] : [],
      ),
    ).toEqual([
      ['php', { resolute: '8.1.31' }],
      ['swift', { resolute: '6.4.0' }],
    ]);
  });

  test('tools have the minimum versions of their install services', () => {
    // the values are defined in the install services, see `listSupportedTools`
    const entries: [string, types.ToolMetadata][] = Object.entries(tools);
    expect(
      entries.flatMap(([name, { minVersion }]) =>
        minVersion ? [[name, minVersion]] : [],
      ),
    ).toEqual([
      ['bun', '0.5.3'],
      ['cabal', '3.4.1.0'],
      ['deno', '2.0.1'],
      ['docker', '18.09.0'],
      ['docker-compose', '2.0.1'],
      ['dotnet', '6.0.100'],
      ['erlang', '24.2.0.0'],
      ['flutter', '1.22.6'],
      ['flux', '0.6.0'],
      ['gh', '2.0.0'],
      ['ghc', '8.10.1'],
      ['git', '2.33.0'],
      ['git-lfs', '2.6.0'],
      ['gleam', '0.23.0'],
      ['helm', '3.1.0'],
      ['jq', '1.7.1'],
      ['kustomize', '3.3.0'],
      ['mise', '2024.1.0'],
      ['nix', '2.10.3'],
      ['php', '7.4.0'],
      ['pixi', '0.39.2'],
      ['powershell', '7.2.0'],
      ['protoc', '3.0.0'],
      ['python', '2.7.18'],
      ['ruby', '2.7.7'],
      ['sbt', '0.13.17'],
      ['skopeo', '1.14.0'],
      ['sops', '3.8.0'],
      ['swift', '5.7'],
      ['tofu', '1.6.3'],
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

import { readFile } from 'node:fs/promises';
import { describe, expect, expectTypeOf, test } from 'vitest';
import type { z } from 'zod';
import { tools } from '../../packages/base/src/data.ts';
import { defaultDistro, toolNames } from '../../packages/base/src/index.ts';
import {
  DistroCode,
  type InstallToolType,
  ToolMetadata,
  type ToolType,
} from '../../packages/base/src/schema.ts';
import * as schemas from '../../packages/base/src/tool-versions-schema.ts';
import type * as tvTypes from '../../packages/base/src/tool-versions-types.ts';
import type * as types from '../../packages/base/src/types.ts';

const checksum = `sha256:${'a'.repeat(64)}`;
const integrity = `sha256-${'A'.repeat(43)}=`;
const file = {
  name: 'tool-1.0.0.tar.gz',
  url: 'https://example.com/tool-1.0.0.tar.gz',
  checksum,
  arch: 'amd64',
};
const source = {
  datasource: 'github-releases',
  packageName: 'example/tool',
  versioning: 'semver',
};
const schema = 'https://example.com/v1/tool.schema.json';
const updatedAt = '2026-10-16T00:00:00Z';

/** The codenames of the Ubuntu versions the default image can be built from. */
const ubuntuCodenames: Record<string, types.DistroCode> = {
  '22.04': 'jammy',
  '24.04': 'noble',
  '26.04': 'resolute',
};

// type-only checks, `tsc` fails when the zod schemas of the base package and
// its zod free types drift apart
describe('packages/base', () => {
  test('defaultDistro is the Ubuntu release of the default image', async () => {
    const dockerfile = await readFile(
      new URL('../../Dockerfile', import.meta.url),
      'utf8',
    );
    const version = /^FROM ghcr\.io\/containerbase\/ubuntu:(\d+\.\d+)/m.exec(
      dockerfile,
    )?.[1];

    expect(version).toBeDefined();
    expect(ubuntuCodenames[version!]).toBe(defaultDistro);
  });

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
      ['dart', '2.0.0'],
      ['deno', '2.0.1'],
      ['docker', '20.10.0'],
      ['docker-compose', '2.0.1'],
      ['dotnet', '6.0.100'],
      ['erlang', '24.2.0.0'],
      ['flutter', '1.22.6'],
      ['flux', '0.6.0'],
      ['gh', '2.0.0'],
      ['ghc', '8.10.1'],
      ['git', '2.48.0'],
      ['git-lfs', '2.6.0'],
      ['gleam', '0.23.0'],
      ['helm', '3.1.0'],
      ['java', '8.0.302+8'],
      ['java-jdk', '8.0.302+8'],
      ['java-jre', '8.0.302+8'],
      ['jq', '1.7.1'],
      ['kubectl', '1.13.11'],
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

  test('the tool-versions schemas match the zod free types', () => {
    expectTypeOf<
      z.infer<typeof schemas.ToolFile>
    >().toEqualTypeOf<tvTypes.ToolFile>();
    expectTypeOf<
      z.infer<typeof schemas.FileIntegrity>
    >().toEqualTypeOf<tvTypes.FileIntegrity>();
    expectTypeOf<
      z.infer<typeof schemas.ToolVersion>
    >().toEqualTypeOf<tvTypes.ToolVersion>();
    expectTypeOf<
      z.infer<typeof schemas.ToolVersions>
    >().toEqualTypeOf<tvTypes.ToolVersions>();
    expectTypeOf<
      z.infer<typeof schemas.VersionFiles>
    >().toEqualTypeOf<tvTypes.VersionFiles>();
    expectTypeOf<
      z.infer<typeof schemas.VersionIntegrity>
    >().toEqualTypeOf<tvTypes.VersionIntegrity>();
    expectTypeOf<
      z.infer<typeof schemas.FileReference>
    >().toEqualTypeOf<tvTypes.FileReference>();
    expectTypeOf<
      z.infer<typeof schemas.ToolIndex>
    >().toEqualTypeOf<tvTypes.ToolIndex>();
    expectTypeOf<
      z.infer<typeof schemas.FormatIndex>
    >().toEqualTypeOf<tvTypes.FormatIndex>();
  });

  test('ToolVersions parses a <tool>.json file', () => {
    const parsed = schemas.ToolVersions.parse({
      $schema: schema,
      tool: 'tool',
      minVersion: '1.0.0',
      distroMinVersion: { resolute: '2.0.0' },
      source,
      updatedAt,
      versions: [{ version: '1.0.0', lts: true }, { version: '0.9.0' }],
    });

    expect(parsed.versions.map((v) => v.version)).toEqual(['1.0.0', '0.9.0']);
    expect(parsed.distroMinVersion).toEqual({ resolute: '2.0.0' });
  });

  test('ToolVersion keeps the constraints', () => {
    const constraints = { node: '>=20.17.0' };

    expect(
      schemas.ToolVersion.parse({ version: '1.0.0', constraints }),
    ).toEqual({ version: '1.0.0', constraints });
  });

  test.each([
    { name: 'an empty key', constraints: { '': '>=20.17.0' } },
    { name: 'an empty value', constraints: { node: '' } },
  ])('ToolVersion rejects $name in the constraints', ({ constraints }) => {
    expect(
      schemas.ToolVersion.safeParse({ version: '1.0.0', constraints }).success,
    ).toBe(false);
  });

  test('VersionFiles parses a <tool>/<version>.json file', () => {
    expect(
      schemas.VersionFiles.safeParse({
        $schema: schema,
        tool: 'tool',
        version: '1.0.0',
        files: [file],
      }).success,
    ).toBe(true);
  });

  test('VersionIntegrity parses a <tool>.integrity.json file', () => {
    expect(
      schemas.VersionIntegrity.safeParse({
        tool: 'tool',
        versions: { '1.0.0': integrity },
      }).success,
    ).toBe(true);
  });

  test('ToolIndex parses the v1 index', () => {
    const reference = { file: 'tool.json', integrity };
    expect(
      schemas.ToolIndex.safeParse({
        updatedAt,
        tools: [
          { tool: 'tool', versionCount: 2, slim: reference },
          {
            tool: 'other',
            versionCount: 1,
            slim: reference,
            versionFiles: { file: 'other.integrity.json', integrity },
          },
        ],
      }).success,
    ).toBe(true);
  });

  test('FormatIndex parses the root index', () => {
    expect(
      schemas.FormatIndex.safeParse({
        defaultDistro: 'noble',
        formats: [
          { version: 2, path: 'v2', status: 'preview' },
          {
            version: 1,
            path: 'v1',
            status: 'deprecated',
            removalDate: '2027-01-01',
          },
        ],
      }).success,
    ).toBe(true);
  });

  test('unknown keys and archs still parse', () => {
    const parsed = schemas.ToolVersions.parse({
      tool: 'tool',
      source,
      updatedAt,
      versions: [],
      added: true,
    });

    // published files carry a `source` which is not read
    expect(parsed).not.toHaveProperty('source');
    expect(parsed).not.toHaveProperty('added');
    expect(schemas.ToolFile.parse({ ...file, arch: 'riscv64' }).arch).toBe(
      'riscv64',
    );
  });

  test.each([
    {
      name: 'a bad checksum',
      value: { ...file, checksum: 'sha256:abc' },
    },
    {
      name: 'an http url',
      value: { ...file, url: 'http://example.com/tool-1.0.0.tar.gz' },
    },
  ])('ToolFile rejects $name', ({ value }) => {
    expect(schemas.ToolFile.safeParse(value).success).toBe(false);
  });

  test('FileIntegrity rejects a bad integrity', () => {
    expect(schemas.FileIntegrity.safeParse(integrity).success).toBe(true);
    expect(schemas.FileIntegrity.safeParse('sha256-abc').success).toBe(false);
    expect(
      schemas.VersionIntegrity.safeParse({
        tool: 'tool',
        versions: { '1.0.0': 'md5-abc' },
      }).success,
    ).toBe(false);
  });
});

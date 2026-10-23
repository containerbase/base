import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, expectTypeOf, test, vi } from 'vitest';
import type { z } from 'zod';
import { tools } from '../../packages/base/src/data.ts';
import * as main from '../../packages/base/src/index.ts';
import {
  containerbaseVersionFile,
  defaultDistro,
  getUrlReplacements,
  isCompatibleVersion,
  isContainerbase,
  isToolVersionsFormat,
  packageVersion,
  replaceUrl,
  toolNames,
  toolVersionsFormat,
  toolVersionsFormatPath,
  toolVersionsPath,
  validateContainerbaseVersion,
} from '../../packages/base/src/index.ts';
import {
  Arch,
  DistroCode,
  type InstallToolType,
  ToolMetadata,
  type ToolType,
} from '../../packages/base/src/schema.ts';
import * as schemas from '../../packages/base/src/tool-versions-schema.ts';
import type * as tvTypes from '../../packages/base/src/tool-versions-types.ts';
import type * as types from '../../packages/base/src/types.ts';
import * as zodEntry from '../../packages/base/src/zod.ts';
import { toolVersionsDir } from '../../tools/tool-versions.ts';

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

  test('Arch matches the zod free type', () => {
    expectTypeOf<z.infer<typeof Arch>>().toEqualTypeOf<types.Arch>();
  });

  test('Arch accepts the containerbase archs', () => {
    expect(Arch.options).toEqual(['amd64', 'arm64']);
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
      ['android-sdk-cmdline-tools', '1'],
      ['apko', '0.1.1'],
      ['apm', '0.4.0'],
      ['bazelisk', '0.0.1'],
      ['buf', '0.1.0'],
      ['buildx', '0.2.0'],
      ['bun', '0.5.3'],
      ['cabal', '3.4.1.0'],
      ['composer', '1.0.0'],
      ['dart', '2.0.0'],
      ['deno', '2.0.1'],
      ['devbox', '0.0.6'],
      ['docker', '20.10.0'],
      ['docker-compose', '2.0.1'],
      ['dotnet', '6.0.100'],
      ['elixir', '1.4.3'],
      ['erlang', '24.2.0.0'],
      ['flutter', '1.22.6'],
      ['flux', '0.6.0'],
      ['gh', '2.0.0'],
      ['ghc', '8.10.1'],
      ['git', '2.48.0'],
      ['git-lfs', '2.6.0'],
      ['gleam', '0.23.0'],
      ['golang', '1.9.0'],
      ['gradle', '1.0'],
      ['helm', '3.1.0'],
      ['helmfile', '0.145.0'],
      ['java', '8.0.302+8'],
      ['java-jdk', '8.0.302+8'],
      ['java-jre', '8.0.302+8'],
      ['jb', '0.2.0'],
      ['jq', '1.7.1'],
      ['kubectl', '1.13.11'],
      ['kustomize', '3.3.0'],
      ['maven', '3.0.4'],
      ['mise', '2024.1.0'],
      ['mono', '6.14.1'],
      ['nix', '2.10.3'],
      ['node', '8.7.0'],
      ['nub', '0.0.34'],
      ['nuget', '3.4.4'],
      ['php', '7.4.0'],
      ['pixi', '0.39.2'],
      ['powershell', '7.2.0'],
      ['protoc', '3.0.0'],
      ['python', '2.7.18'],
      ['ruby', '2.7.7'],
      ['rust', '1.7.0'],
      ['sbt', '0.13.17'],
      ['scala', '2.11.2'],
      ['skopeo', '1.14.0'],
      ['sops', '3.8.0'],
      ['swift', '5.7'],
      ['terraform', '0.1.0'],
      ['tofu', '1.6.3'],
      ['vendir', '0.4.0'],
      ['vp', '0.3.1'],
      ['wally', '0.3.0'],
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

  test('ToolVersion keeps the archs and distros', () => {
    const version = {
      version: '1.0.0',
      archs: ['amd64', 'arm64'],
      distros: ['jammy', 'noble'],
    };

    expect(schemas.ToolVersion.parse(version)).toEqual(version);
  });

  test('ToolVersions keeps the minCb ranges', () => {
    const minCb = [{ version: '0.9.0', cb: '14.51.0' }];
    const file = {
      tool: 'tool',
      updatedAt,
      versions: [{ version: '1.0.0' }, { version: '0.9.0' }],
    };

    expect(schemas.ToolVersions.parse({ ...file, minCb }).minCb).toEqual(minCb);
  });

  test.each([
    { name: 'no ranges', minCb: [] },
    { name: 'an empty cb', minCb: [{ version: '1.0.0', cb: '' }] },
  ])('ToolVersions accepts $name in the minCb', ({ minCb }) => {
    expect(
      schemas.ToolVersions.parse({
        tool: 'tool',
        updatedAt,
        versions: [],
        minCb,
      }).minCb,
    ).toEqual(minCb);
  });

  test.each([
    { name: 'an empty version', minCb: [{ version: '', cb: '14.51.0' }] },
    { name: 'a range without cb', minCb: [{ version: '1.0.0' }] },
  ])('ToolVersions rejects $name in the minCb', ({ minCb }) => {
    expect(
      schemas.ToolVersions.safeParse({
        tool: 'tool',
        updatedAt,
        versions: [],
        minCb,
      }).success,
    ).toBe(false);
  });

  test.each([
    { name: 'empty archs', value: { archs: [] } },
    { name: 'an empty arch', value: { archs: [''] } },
    { name: 'empty distros', value: { distros: [] } },
    { name: 'an empty distro', value: { distros: [''] } },
  ])('ToolVersion rejects $name', ({ value }) => {
    expect(
      schemas.ToolVersion.safeParse({ version: '1.0.0', ...value }).success,
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

  test('the format is version 1 in the v1 folder', () => {
    expect(toolVersionsFormat).toBe(1);
    expect(toolVersionsFormatPath).toBe('v1');
  });

  test.each([
    {
      name: 'a tool schema',
      url: 'https://containerbase.github.io/tool-versions/v1/tool.schema.json',
      expected: true,
    },
    {
      name: 'an index schema',
      url: 'https://containerbase.github.io/tool-versions/v1/index.schema.json',
      expected: true,
    },
    {
      name: 'a version schema',
      url: 'https://containerbase.github.io/tool-versions/v1/version.schema.json',
      expected: true,
    },
    {
      name: 'a mirror host',
      url: 'https://mirror.example.com/v1/tool.schema.json',
      expected: true,
    },
    {
      name: 'another format',
      url: 'https://containerbase.github.io/tool-versions/v2/tool.schema.json',
      expected: false,
    },
    {
      name: 'a format with the same suffix',
      url: 'https://containerbase.github.io/tool-versions/xv1/tool.schema.json',
      expected: false,
    },
    {
      name: 'a url which is no schema',
      url: 'https://containerbase.github.io/tool-versions/v1/tool.json',
      expected: false,
    },
    {
      name: 'a v1 path with a query',
      url: 'https://example.com/v1/tool.schema.json?x=1',
      expected: true,
    },
    {
      name: 'a v1 path with a fragment',
      url: 'https://example.com/v1/tool.schema.json#/definitions',
      expected: true,
    },
    {
      name: 'a plain http mirror',
      url: 'http://localhost:8080/v1/tool.schema.json',
      expected: true,
    },
    {
      name: 'a v2 path with a v1 fragment',
      url: 'https://example.com/v2/tool.schema.json#/v1/tool.schema.json',
      expected: false,
    },
    {
      name: 'a v2 path with a v1 query',
      url: 'https://example.com/v2/tool.schema.json?x=/v1/tool.schema.json',
      expected: false,
    },
    { name: 'an invalid url', url: 'not a url', expected: false },
    { name: 'no value', url: undefined, expected: false },
  ])('isToolVersionsFormat handles $name', ({ url, expected }) => {
    expect(isToolVersionsFormat(url)).toBe(expected);
  });

  test('both entries export the format', () => {
    for (const entry of [main, zodEntry]) {
      expect(entry.toolVersionsFormat).toBe(toolVersionsFormat);
      expect(entry.toolVersionsFormatPath).toBe(toolVersionsFormatPath);
      expect(entry.isToolVersionsFormat).toBe(isToolVersionsFormat);
    }
  });

  test('toolVersionsPath is where the build embeds the data', () => {
    expect(`dist/docker${toolVersionsPath}`).toBe(toolVersionsDir);
  });

  test.each([
    { name: 'set', env: { CONTAINERBASE: '1' }, expected: true },
    { name: 'empty', env: { CONTAINERBASE: '' }, expected: false },
    { name: 'missing', env: {}, expected: false },
  ])(
    'isContainerbase is $expected when CONTAINERBASE is $name',
    ({ env, expected }) => {
      expect(isContainerbase(env)).toBe(expected);
    },
  );

  test('isContainerbase checks process.env by default', () => {
    vi.stubEnv('CONTAINERBASE', '1');
    expect(isContainerbase()).toBe(true);
    vi.stubEnv('CONTAINERBASE', undefined);
    expect(isContainerbase()).toBe(false);
    vi.unstubAllEnvs();
  });

  test.each([
    { image: '14.2.0', version: '14.2.0', expected: true },
    { image: '14.2.1', version: '14.2.0', expected: true },
    { image: '14.3.0', version: '14.2.5', expected: true },
    { image: '14.2.0\n', version: '14.2.0', expected: true },
    { image: '14.1.9', version: '14.2.0', expected: false },
    { image: '14.2.0', version: '14.2.1', expected: false },
    { image: '15.0.0', version: '14.2.0', expected: false },
    { image: '13.9.0', version: '14.2.0', expected: false },
    { image: 'latest', version: '14.2.0', expected: false },
    { image: '14.2.0', version: 'invalid', expected: false },
  ])(
    'isCompatibleVersion of image $image with $version is $expected',
    ({ image, version, expected }) => {
      expect(isCompatibleVersion(image, version)).toBe(expected);
    },
  );

  test('packageVersion is the version of the package', async () => {
    const pkg = JSON.parse(
      await readFile(
        new URL('../../packages/base/package.json', import.meta.url),
        'utf8',
      ),
    ) as { version: string };

    expect(packageVersion).toBe(pkg.version);
  });

  test('validateContainerbaseVersion reads the image version', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'containerbase-version-'));
    const file = join(dir, 'version');
    try {
      // the package of the repository has the placeholder version 0.0.0
      await writeFile(file, '0.1.0\n');
      await expect(validateContainerbaseVersion(file)).resolves.toBe('0.1.0');

      await writeFile(file, '1.0.0\n');
      await expect(validateContainerbaseVersion(file)).rejects.toThrow(
        'The containerbase image version 1.0.0 is not compatible with @containerbase/base 0.0.0-semantic-release',
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test.each([
    '0.0.0-PLACEHOLDER+a8c820972f2d16ce9fd7eeae9bcfbfc5b9e6f616',
    '0.0.0-PLACEHOLDER',
  ])(
    'validateContainerbaseVersion skips the development image version %s',
    async (version) => {
      const dir = await mkdtemp(join(tmpdir(), 'containerbase-version-'));
      const file = join(dir, 'version');
      try {
        await writeFile(file, `${version}\n`);
        await expect(validateContainerbaseVersion(file)).resolves.toBe(version);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  );

  test('validateContainerbaseVersion throws for an empty or missing version file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'containerbase-version-'));
    const file = join(dir, 'version');
    try {
      await expect(validateContainerbaseVersion(file)).rejects.toThrow(
        `The containerbase image version file ${file} is missing`,
      );
      // other read errors name the file and keep the reason
      await expect(validateContainerbaseVersion(dir)).rejects.toThrow(
        `The containerbase image version file ${dir} can't be read: EISDIR`,
      );

      await writeFile(file, '\n');
      await expect(validateContainerbaseVersion(file)).rejects.toThrow(
        `The containerbase image version file ${file} is empty`,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('containerbaseVersionFile is where the build writes the version', async () => {
    const build = await readFile(
      new URL('../../tools/build.js', import.meta.url),
      'utf8',
    );

    expect(build).toContain(`'dist/docker${containerbaseVersionFile}'`);
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

  test('getUrlReplacements reads the replacements in numerical order', () => {
    expect(
      getUrlReplacements({
        URL_REPLACE_10_FROM: 'https://example.com/10',
        URL_REPLACE_10_TO: 'https://example.test/10',
        URL_REPLACE_2_FROM: 'https://example.com/2',
        URL_REPLACE_2_TO: 'https://example.test/2',
        URL_REPLACE_3_FROM: 'https://example.com/3',
        URL_REPLACE_4_FROM: 'https://example.com/4',
        URL_REPLACE_4_TO: '',
        URL_REPLACE_X_FROM: 'https://example.com/x',
        URL_REPLACE_X_TO: 'https://example.test/x',
      }),
    ).toEqual({
      replacements: [
        ['https://example.com/2', 'https://example.test/2'],
        ['https://example.com/10', 'https://example.test/10'],
      ],
      invalid: ['URL_REPLACE_3_FROM', 'URL_REPLACE_4_FROM'],
    });
  });

  test('getUrlReplacements reads process.env by default', () => {
    vi.stubEnv('URL_REPLACE_0_FROM', 'https://example.com');
    vi.stubEnv('URL_REPLACE_0_TO', 'https://example.test');
    expect(getUrlReplacements().replacements).toEqual([
      ['https://example.com', 'https://example.test'],
    ]);
    vi.unstubAllEnvs();
  });

  test('replaceUrl applies the cdn first, then the replacements in order', () => {
    const replacements: [string, string][] = [
      ['https://example.com', 'https://example.test'],
      [
        'https://cdn.example.com/registry.npmjs.org',
        'https://npm.example.test',
      ],
    ];

    expect(replaceUrl('https://example.com/file.txt', replacements)).toBe(
      'https://example.test/file.txt',
    );
    expect(replaceUrl('https://example.org/file.txt', replacements)).toBe(
      'https://example.org/file.txt',
    );
    expect(
      replaceUrl(
        'https://example.test/file.txt',
        [],
        'https://cdn.example.com/',
      ),
    ).toBe('https://cdn.example.com/example.test/file.txt');
    expect(
      replaceUrl(
        'https://registry.npmjs.org',
        replacements,
        'https://cdn.example.com',
      ),
    ).toBe('https://npm.example.test');
    expect(replaceUrl('https://registry.npmjs.org', replacements, '')).toBe(
      'https://registry.npmjs.org',
    );
  });
});

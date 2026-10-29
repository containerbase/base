import { mkdir, rm, writeFile } from 'node:fs/promises';
import { arch } from 'node:os';
import { type Container, injectFromHierarchy, injectable } from 'inversify';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  EnvService,
  HttpService,
  ToolVersionsService,
  createContainer,
} from '../services/index.ts';
import { getDistro, logger } from '../utils/index.ts';
import { ToolVersionResolverService } from './tool-version-resolver.service.ts';
import {
  TOOL_VERSION_RESOLVER,
  ToolVersionResolver,
} from './tool-version-resolver.ts';
import { scope } from '~test/http-mock.ts';
import { rootPath } from '~test/path.ts';

@injectable()
@injectFromHierarchy()
class DummyVersionResolver extends ToolVersionResolver {
  readonly tool = 'dummy';

  /** Resolves `latest` to `1.2.3`. */
  resolve(version: string | undefined): Promise<string | undefined> {
    return Promise.resolve(version === 'latest' ? '1.2.3' : version);
  }
}

@injectable()
@injectFromHierarchy()
class LatestOnlyVersionResolver extends ToolVersionResolver {
  readonly tool = 'latest-only';
  override readonly latestOnly = true;

  /** Resolves any version to `9.9.9`. */
  resolve(_version: string | undefined): Promise<string | undefined> {
    return Promise.resolve('9.9.9');
  }
}

@injectable()
@injectFromHierarchy()
class LtsDataVersionResolver extends ToolVersionResolver {
  readonly tool = 'lts-data';
  override readonly dataField = 'lts';

  /** Resolves any version to `9.9.9`, so its use is visible. */
  resolve(_version: string | undefined): Promise<string | undefined> {
    return Promise.resolve('9.9.9');
  }
}

@injectable()
@injectFromHierarchy()
class NpmDataVersionResolver extends ToolVersionResolver {
  readonly tool = 'npm-data';
  override readonly dataField = 'latest';

  /** Resolves any version to `9.9.9`, so its use is visible. */
  resolve(_version: string | undefined): Promise<string | undefined> {
    return Promise.resolve('9.9.9');
  }
}

@injectable()
@injectFromHierarchy()
class ExactDataVersionResolver extends ToolVersionResolver {
  readonly tool = 'exact-data';
  override readonly dataField = 'lts';

  /** Keeps the version, like node does for an exact one. */
  resolve(version: string | undefined): Promise<string | undefined> {
    return Promise.resolve(version);
  }
}

@injectable()
@injectFromHierarchy()
class BuildDataVersionResolver extends ToolVersionResolver {
  readonly tool = 'build-data';
  override readonly dataField = 'lts';

  /** Appends the build `+8`, like java does for an exact version. */
  resolve(version: string | undefined): Promise<string | undefined> {
    return Promise.resolve(`${version}+8`);
  }
}

vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:os')>()),
  arch: vi.fn(() => 'x64'),
}));
vi.mock('../utils/index.ts', async (importActual) => ({
  ...(await importActual<typeof import('../utils/index.ts')>()),
  getDistro: vi.fn(),
}));

/** The embedded `v1` folder, set before each test as the root dir comes from the test setup. */
let dir!: string;

/** Versions of a tool, newest first, a `-rc` one is a prerelease. */
const versions = [
  '21.0.0-rc1',
  '20.10.0',
  '20.9.0',
  '8.10.1',
  '8.10',
  '3.12.4',
  '3.12.3',
  '3.11.9',
];

/** A version entry of a tool file, an object limits the version to archs or distros. */
type Entry =
  | string
  | {
      version: string;
      lts?: true;
      deprecated?: true;
      archs?: string[];
      distros?: string[];
    };

/** A range of the top-level `minCb` list of a tool file. */
interface MinCb {
  version: string;
  cb: string;
}

/**
 * The content of a `<tool>.json` file.
 * @param tool - the tool name
 * @param list - the versions, a `-rc` one is a prerelease, a `-lts` one is an
 * LTS release, the suffix is not part of the version
 * @param minCb - the minimum containerbase version ranges, if any
 */
function toolFile(tool: string, list: Entry[], minCb?: MinCb[]): object {
  return {
    tool,
    updatedAt: '2026-10-16T00:00:00Z',
    ...(minCb && { minCb }),
    versions: list.map((entry) => {
      if (typeof entry !== 'string') {
        return entry;
      }
      const version = entry.replace(/-lts$/, '');
      if (entry.includes('-rc')) {
        return { version, prerelease: true };
      }
      return entry.endsWith('-lts') ? { version, lts: true } : { version };
    }),
  };
}

/**
 * Writes the embedded versions of a tool.
 * @param tool - the tool name
 * @param list - the versions, newest first
 * @param minCb - the minimum containerbase version ranges, if any
 */
async function embed(
  tool: string,
  list: Entry[],
  minCb?: MinCb[],
): Promise<void> {
  await writeFile(
    `${dir}/${tool}.json`,
    JSON.stringify(toolFile(tool, list, minCb)),
  );
}

/**
 * Mocks the online file of a tool.
 * @param tool - the tool name
 * @param status - the http status to reply with
 * @param body - a list of versions for a tool file, or the raw reply
 * @param minCb - the minimum containerbase version ranges of a tool file, if any
 */
function serve(
  tool: string,
  status: number,
  body?: Entry[] | string | object,
  minCb?: MinCb[],
): void {
  scope('https://containerbase.github.io')
    .get(`/tool-versions/v1/${tool}.json`)
    .reply(status, Array.isArray(body) ? toolFile(tool, body, minCb) : body);
}

describe('cli/install-tool/tool-version-resolver.service', () => {
  let child!: Container;
  let svc!: ToolVersionResolverService;

  beforeEach(async () => {
    dir = rootPath('usr/local/containerbase/tool-versions/v1');
    // no embedded data unless a test writes it
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    // no embedded release, so the online data is looked up
    await rm(`${dir}/../release.json`, { force: true });

    // the host runs containerbase 14.51.0
    vi.stubGlobal('CONTAINERBASE_VERSION', '14.51.0');
    // the host is amd64 on jammy
    vi.mocked(arch).mockReturnValue('x64');
    vi.mocked(getDistro).mockResolvedValue({
      name: 'Ubuntu',
      versionCode: 'jammy',
      versionId: '22.04',
    });

    child = createContainer();
    child.bind(ToolVersionResolverService).toSelf();
    child.bind(TOOL_VERSION_RESOLVER).to(DummyVersionResolver);
    child.bind(TOOL_VERSION_RESOLVER).to(LatestOnlyVersionResolver);
    child.bind(TOOL_VERSION_RESOLVER).to(LtsDataVersionResolver);
    child.bind(TOOL_VERSION_RESOLVER).to(NpmDataVersionResolver);
    child.bind(TOOL_VERSION_RESOLVER).to(ExactDataVersionResolver);
    child.bind(TOOL_VERSION_RESOLVER).to(BuildDataVersionResolver);
    svc = await child.getAsync(ToolVersionResolverService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('a resolver with an lts data field', () => {
    /** Releases of a tool with LTS lines, newest first. */
    const lts: Entry[] = [
      '25.1.0',
      '24.2.0-lts',
      '24.1.0-lts',
      '23.0.0',
      '22.5.0-lts',
    ];

    beforeEach(async () => {
      // the data is only read for a tool with an embedded file
      await embed('lts-data', ['0.0.1']);
    });

    test.each([undefined, '', 'latest'])(
      'resolves %j to the newest lts release of the data',
      async (version) => {
        serve('lts-data', 200, { ...toolFile('lts-data', lts), lts: true });

        expect(await svc.resolve('lts-data', version)).toBe('24.2.0');
      },
    );

    test('resolves a partial version from the data', async () => {
      serve('lts-data', 200, { ...toolFile('lts-data', lts), lts: true });

      expect(await svc.resolve('lts-data', '23')).toBe('23.0.0');
    });

    test('uses the resolver when the partial version has no match, without a warning', async () => {
      serve('lts-data', 200, { ...toolFile('lts-data', lts), lts: true });

      expect(await svc.resolve('lts-data', '26')).toBe('9.9.9');

      expect(logger.warn).not.toHaveBeenCalled();
    });

    test('uses the resolver when the online data has no lts field', async () => {
      serve('lts-data', 200, lts);

      expect(await svc.resolve('lts-data', 'latest')).toBe('9.9.9');
    });

    test('uses the resolver, not the embedded data, when the online data is not available', async () => {
      await writeFile(
        `${dir}/lts-data.json`,
        JSON.stringify({ ...toolFile('lts-data', lts), lts: true }),
      );
      serve('lts-data', 404);

      expect(await svc.resolve('lts-data', 'latest')).toBe('9.9.9');

      expect(logger.warn).not.toHaveBeenCalled();
    });

    test('uses the embedded data when the online data is turned off', async () => {
      vi.stubEnv('CONTAINERBASE_RESOLVER_OFFLINE', 'true');
      await writeFile(
        `${dir}/lts-data.json`,
        JSON.stringify({ ...toolFile('lts-data', lts), lts: true }),
      );

      expect(await svc.resolve('lts-data', 'latest')).toBe('24.2.0');
    });

    test('uses the resolver when the embedded data has no lts field', async () => {
      vi.stubEnv('CONTAINERBASE_RESOLVER_OFFLINE', 'true');
      await embed('lts-data', lts);

      expect(await svc.resolve('lts-data', '24')).toBe('9.9.9');
    });

    test('skips the data of a tool without an embedded file', async () => {
      await rm(`${dir}/lts-data.json`);
      const online = vi.spyOn(HttpService.prototype, 'getJson');

      expect(await svc.resolve('lts-data', undefined)).toBe('9.9.9');

      expect(online).not.toHaveBeenCalled();
    });

    test.each([undefined, '24'])(
      'skips the data for %j when it is turned off, like for install-npm',
      async (version) => {
        const data = vi.spyOn(
          ToolVersionsService.prototype,
          'getResolveVersions',
        );

        expect(await svc.resolve('lts-data', version, false)).toBe('9.9.9');

        expect(data).not.toHaveBeenCalled();
      },
    );

    test.each([undefined, 'latest', '24'])(
      'warns and uses the resolver for %j when every match needs a newer containerbase',
      async (version) => {
        serve('lts-data', 200, {
          ...toolFile('lts-data', lts),
          lts: true,
          minCb: [{ version: '22.5.0', cb: '15.0.0' }],
        });

        expect(await svc.resolve('lts-data', version)).toBe('9.9.9');

        expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
          'lts-data 24.2.0 needs containerbase 15.0.0 or newer, running 14.51.0, the own lookup of the tool is used',
        );
      },
    );

    test.each([
      {
        name: 'turned off online data',
        setup: () => {
          vi.stubEnv('CONTAINERBASE_RESOLVER_OFFLINE', 'true');
          return Promise.resolve();
        },
        // the embedded data may be months old then
        note: ' (embedded, possibly outdated tool-versions data)',
      },
      {
        name: 'current embedded data',
        setup: () =>
          writeFile(
            `${dir}/../release.json`,
            JSON.stringify({
              version: '1.8.0',
              buildTime: new Date(Date.now() - 60_000).toISOString(),
            }),
          ),
        note: '',
      },
    ])(
      'notes the embedded data in the newer containerbase warning with $name',
      async ({ setup, note }) => {
        await setup();
        await writeFile(
          `${dir}/lts-data.json`,
          JSON.stringify({
            ...toolFile('lts-data', lts),
            lts: true,
            minCb: [{ version: '22.5.0', cb: '15.0.0' }],
          }),
        );

        expect(await svc.resolve('lts-data', 'latest')).toBe('9.9.9');

        expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
          `lts-data 24.2.0 needs containerbase 15.0.0 or newer, running 14.51.0, the own lookup of the tool is used${note}`,
        );
      },
    );

    test('keeps a release the embedded data with the lts field lists', async () => {
      await writeFile(
        `${dir}/lts-data.json`,
        JSON.stringify({ ...toolFile('lts-data', ['8.10']), lts: true }),
      );

      expect(await svc.resolve('lts-data', '8.10')).toBe('8.10');
    });

    test('passes an exact version to the resolver', async () => {
      expect(await svc.resolve('lts-data', '24.1.0')).toBe('9.9.9');
    });

    test('warns and keeps an exact version the embedded data lists as needing a newer containerbase', async () => {
      await embed(
        'exact-data',
        ['26.13.0', '24.1.0'],
        [{ version: '26.13.0', cb: '15.0.0' }],
      );
      const online = vi.spyOn(HttpService.prototype, 'getJson');

      expect(await svc.resolve('exact-data', '26.13.0')).toBe('26.13.0');

      expect(online).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
        'exact-data 26.13.0 needs containerbase 15.0.0 or newer, running 14.51.0, 26.13.0 is used as is',
      );
    });

    test('warns about the version the resolver resolves an exact one to', async () => {
      // the data only lists the builds, like for java
      await embed(
        'build-data',
        ['11.0.25+9', '11.0.24+8'],
        [{ version: '11.0.24+8', cb: '15.0.0' }],
      );

      expect(await svc.resolve('build-data', '11.0.24')).toBe('11.0.24+8');

      expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
        'build-data 11.0.24+8 needs containerbase 15.0.0 or newer, running 14.51.0, 11.0.24+8 is used as is',
      );
    });

    test('reads no data for an exact version when it is turned off, like for install-npm', async () => {
      await embed(
        'exact-data',
        ['26.13.0', '24.1.0'],
        [{ version: '26.13.0', cb: '15.0.0' }],
      );
      const embedded = vi.spyOn(ToolVersionsService.prototype, 'getVersions');

      expect(await svc.resolve('exact-data', '26.13.0', false)).toBe('26.13.0');

      expect(embedded).not.toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  describe('npm tools', () => {
    /**
     * The data of an npm tool with the `latest` dist-tag.
     * @param tool - the tool name
     * @param list - the versions, newest first
     * @param latest - the `latest` dist-tag
     */
    function npmFile(tool: string, list: Entry[], latest: string): object {
      return { ...toolFile(tool, list), type: 'npm', latest };
    }

    beforeEach(async () => {
      // the data is only read for a tool with an embedded file
      await embed('npm-data', ['0.0.1']);
    });

    test.each([undefined, 'latest'])(
      'resolves %j to the latest dist-tag, not the newest release',
      async (version) => {
        serve(
          'npm-data',
          200,
          npmFile('npm-data', ['11.0.0', '10.9.0', '10.8.0'], '10.9.0'),
        );

        expect(await svc.resolve('npm-data', version)).toBe('10.9.0');
      },
    );

    test.each([
      // the latest dist-tag wins over a newer release of the line
      { version: '10', latest: '10.8.0', expected: '10.8.0' },
      // a deprecated latest dist-tag is skipped
      { version: '10', latest: '10.9.0', expected: '10.8.0' },
      // a line without the latest dist-tag
      { version: '9', latest: '10.8.0', expected: '9.2.0' },
      // only deprecated releases match
      { version: '8', latest: '10.8.0', expected: '8.1.0' },
    ])(
      'resolves $version with the latest dist-tag $latest',
      async ({ version, latest, expected }) => {
        serve(
          'npm-data',
          200,
          npmFile(
            'npm-data',
            [
              { version: '10.9.0', deprecated: true },
              '10.8.0',
              '9.3.0-rc1',
              { version: '9.3.0', deprecated: true },
              '9.2.0',
              { version: '8.1.0', deprecated: true },
              { version: '8.0.0', deprecated: true },
            ],
            latest,
          ),
        );

        expect(await svc.resolve('npm-data', version)).toBe(expected);
      },
    );

    test('uses the resolver when the data has no latest dist-tag', async () => {
      serve('npm-data', 200, ['10.9.0']);

      expect(await svc.resolve('npm-data', '10')).toBe('9.9.9');
    });

    test.each([
      {
        name: 'needs a newer containerbase',
        file: {
          ...npmFile(
            'npm-data',
            [
              '11.0.0',
              '10.9.0',
              { version: '10.8.0', deprecated: true },
              '10.7.0',
            ],
            '10.9.0',
          ),
          minCb: [{ version: '10.9.0', cb: '15.0.0' }],
        },
        expected: '10.7.0',
      },
      {
        name: 'is not available for the host',
        file: npmFile(
          'npm-data',
          [{ version: '10.9.0', archs: ['arm64'] }, '10.8.0'],
          '10.9.0',
        ),
        expected: '10.8.0',
      },
      {
        name: 'is not installable and only deprecated releases are',
        file: npmFile(
          'npm-data',
          [
            { version: '10.9.0', archs: ['arm64'] },
            { version: '10.8.0', deprecated: true },
          ],
          '10.9.0',
        ),
        expected: '10.8.0',
      },
    ])(
      'resolves latest to the newest installable release when the dist-tag $name',
      async ({ file, expected }) => {
        serve('npm-data', 200, file);

        expect(await svc.resolve('npm-data', 'latest')).toBe(expected);
      },
    );

    test('resolves latest to a prerelease dist-tag', async () => {
      serve(
        'npm-data',
        200,
        npmFile('npm-data', ['11.0.0-rc1', '10.9.0'], '11.0.0-rc1'),
      );

      expect(await svc.resolve('npm-data', undefined)).toBe('11.0.0-rc1');
    });

    test('warns and uses the resolver when the whole line needs a newer containerbase', async () => {
      serve('npm-data', 200, {
        ...npmFile('npm-data', ['10.9.0', '10.8.0', '9.0.0'], '9.0.0'),
        minCb: [{ version: '10.8.0', cb: '15.0.0' }],
      });

      expect(await svc.resolve('npm-data', '10')).toBe('9.9.9');

      expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
        'npm-data 10.9.0 needs containerbase 15.0.0 or newer, running 14.51.0, the own lookup of the tool is used',
      );
    });

    test('skips the data of a package without an embedded file', async () => {
      await rm(`${dir}/npm-data.json`);
      // no online mock: a request would fail the test

      expect(await svc.resolve('npm-data', '10')).toBe('9.9.9');
    });

    test('resolves a tool without a resolver to the latest dist-tag', async () => {
      serve('other', 200, npmFile('other', ['2.0.0', '1.9.0'], '1.9.0'));

      expect(await svc.resolve('other', 'latest')).toBe('1.9.0');
    });
  });

  test('resolves with the matching resolver', async () => {
    expect(await svc.resolve('dummy', 'latest')).toBe('1.2.3');
    expect(await svc.resolve('dummy', '1.0.0')).toBe('1.0.0');
  });

  test('keeps the version when the resolver returns nothing', async () => {
    expect(await svc.resolve('dummy', undefined)).toBeUndefined();
  });

  test('reads no data for a tool with a resolver', async () => {
    const embedded = vi.spyOn(ToolVersionsService.prototype, 'getVersions');
    const online = vi.spyOn(HttpService.prototype, 'getJson');
    // there is data, but no online mock: a request would fail the test
    await embed('dummy', versions);

    expect(await svc.resolve('dummy', '2')).toBe('2');
    expect(await svc.resolve('dummy', undefined)).toBeUndefined();

    expect(embedded).not.toHaveBeenCalled();
    expect(online).not.toHaveBeenCalled();
  });

  test.each([undefined, '', ' ', 'latest'])(
    'resolves %j with a resolver which only resolves latest',
    async (version) => {
      const online = vi.spyOn(HttpService.prototype, 'getJson');

      expect(await svc.resolve('latest-only', version)).toBe('9.9.9');

      expect(online).not.toHaveBeenCalled();
    },
  );

  test('resolves a partial version of a resolver which only resolves latest from the data', async () => {
    serve('latest-only', 200, ['2.1.0', '2.0.0']);

    expect(await svc.resolve('latest-only', '2')).toBe('2.1.0');
  });

  test('keeps an exact version of a resolver which only resolves latest', async () => {
    await embed('latest-only', ['1.2.3']);

    expect(await svc.resolve('latest-only', '1.2.3')).toBe('1.2.3');
  });

  test.each(['2', '1.2.3'])(
    'lets a resolver which only resolves latest answer %s without the data',
    async (version) => {
      await embed('latest-only', ['2.1.0', '1.2.3']);
      const data = vi.spyOn(ToolVersionsService.prototype, 'getVersions');

      expect(await svc.resolve('latest-only', version, false)).toBe('9.9.9');

      expect(data).not.toHaveBeenCalled();
    },
  );

  test.each([undefined, '2', '1.2.3'])(
    'keeps %j of a tool without a resolver without the data',
    async (version) => {
      await embed('other', ['2.1.0', '1.2.3']);
      const data = vi.spyOn(ToolVersionsService.prototype, 'getVersions');

      expect(await svc.resolve('other', version, false)).toBe(version);

      expect(data).not.toHaveBeenCalled();
    },
  );

  test.each([undefined, 'latest'])(
    'resolves %s of a tool without a resolver to the newest release',
    async (version) => {
      serve('other', 200, ['3.0.0-rc1', '2.0.0', '1.0.0']);

      expect(await svc.resolve('other', version)).toBe('2.0.0');

      expect(logger.debug).toHaveBeenCalledWith(
        { tool: 'other', version, resolved: '2.0.0' },
        'version resolved from the online tool-versions data',
      );
    },
  );

  test.each([undefined, 'latest'])(
    'resolves %s of a tool without a resolver to the newest lts release',
    async (version) => {
      serve('other', 200, [
        '26.0.0-rc1',
        '25.0.0',
        '24.11.0-lts',
        '24.10.0-lts',
        '23.0.0',
      ]);

      expect(await svc.resolve('other', version)).toBe('24.11.0');
    },
  );

  test.each([
    { version: '20', resolved: '20.10.0' },
    { version: '3.12', resolved: '3.12.4' },
    // a release itself stays as it is
    { version: '8.10', resolved: '8.10' },
  ])(
    'resolves the partial version $version of a tool without a resolver',
    async ({ version, resolved }) => {
      serve('other', 200, versions);

      expect(await svc.resolve('other', version)).toBe(resolved);
    },
  );

  test('takes the newest release of a line in the order of the data', async () => {
    // the data is sorted by the versioning of the tool, which isn't compared
    serve('other', 200, ['2.0.9', '2.0.10', '1.0.0']);

    expect(await svc.resolve('other', '2')).toBe('2.0.9');
  });

  test('keeps a release the embedded data lists without the online lookup', async () => {
    await embed('other', versions);
    // no online mock: a request would fail the test
    const online = vi.spyOn(HttpService.prototype, 'getJson');

    expect(await svc.resolve('other', '8.10')).toBe('8.10');

    expect(online).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      { tool: 'other', version: '8.10', resolved: '8.10' },
      'version resolved from the embedded tool-versions data',
    );
  });

  test('looks a partial version up online when the embedded data only lists releases of it', async () => {
    await embed('other', versions);
    serve('other', 200, ['3.12.9']);

    expect(await svc.resolve('other', '3.12')).toBe('3.12.9');

    expect(logger.warn).not.toHaveBeenCalled();
  });

  test.each([undefined, 'latest'])(
    'resolves %s from the newer online data, not the embedded one',
    async (version) => {
      await embed('other', ['1.0.0']);
      serve('other', 200, ['2.0.0']);

      expect(await svc.resolve('other', version)).toBe('2.0.0');
    },
  );

  test('prefers the online data to an older embedded one', async () => {
    await embed('other', ['20.1.0']);
    serve('other', 200, versions);

    expect(await svc.resolve('other', '20')).toBe('20.10.0');

    expect(logger.warn).not.toHaveBeenCalled();
  });

  test('uses the embedded data and warns when the online data is not available', async () => {
    await embed('other', versions);
    serve('other', 404);

    expect(await svc.resolve('other', '20')).toBe('20.10.0');

    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
      { tool: 'other', version: '20', resolved: '20.10.0' },
      expect.stringContaining('embedded'),
    );
    // the warning is the only log of this resolution
    expect(logger.debug).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('version resolved'),
    );
  });

  describe.each([
    {
      name: 'the embedded data is current',
      setup: () =>
        writeFile(
          `${dir}/../release.json`,
          JSON.stringify({
            version: '1.8.0',
            buildTime: new Date(Date.now() - 60_000).toISOString(),
          }),
        ),
      note: '',
      // a tool which only the online data has is looked up online
      online: true,
    },
    {
      name: 'the online data is turned off',
      setup: () => {
        vi.stubEnv('CONTAINERBASE_RESOLVER_OFFLINE', 'true');
        return Promise.resolve();
      },
      // the embedded data may be months old then
      note: ' (embedded, possibly outdated tool-versions data)',
      online: false,
    },
  ])('when $name', ({ setup, note, online }) => {
    beforeEach(async () => {
      await setup();
    });

    test('resolves from the embedded data without the online lookup', async () => {
      await embed('other', versions);
      const online = vi.spyOn(HttpService.prototype, 'getJson');

      expect(await svc.resolve('other', '20')).toBe('20.10.0');

      expect(online).not.toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        { tool: 'other', version: '20', resolved: '20.10.0' },
        'version resolved from the embedded tool-versions data',
      );
    });

    test('warns when the embedded data has no match', async () => {
      await embed('other', ['19.0.0']);

      expect(await svc.resolve('other', '20')).toBe('20');

      expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
        `The tool-versions data has no other release matching 20, 20 is used as is${note}`,
      );
    });

    test('resolves a tool without embedded data online, unless it is turned off', async () => {
      if (online) {
        serve('other', 200, ['2.0.0']);
      }

      // no interceptor when turned off, a request would fail the test
      expect(await svc.resolve('other', 'latest')).toBe(
        online ? '2.0.0' : 'latest',
      );
    });
  });

  test('uses the embedded data at once when the network is down', async () => {
    await embed('other', versions);
    // no retry, a second request would find no interceptor
    scope('https://containerbase.github.io')
      .get('/tool-versions/v1/other.json')
      .once()
      .replyWithError('connection reset');

    expect(await svc.resolve('other', undefined)).toBe('20.10.0');
  });

  test('uses the embedded data when the online data is not valid json', async () => {
    await embed('other', versions);
    serve('other', 200, '{ not json');

    expect(await svc.resolve('other', '3.12')).toBe('3.12.4');
  });

  test('uses the embedded data when the online data is invalid', async () => {
    await embed('other', versions);
    serve('other', 200, { versions: [] });

    expect(await svc.resolve('other', '3.12')).toBe('3.12.4');
  });

  test('warns and keeps the version when the online data has no match, without the embedded data', async () => {
    await embed('other', ['20.1.0']);
    serve('other', 200, ['19.0.0']);

    expect(await svc.resolve('other', '20')).toBe('20');

    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
      'The tool-versions data has no other release matching 20, 20 is used as is',
    );
  });

  test('warns and keeps the version when the embedded data has no match either', async () => {
    await embed('other', ['19.0.0']);
    serve('other', 404);

    expect(await svc.resolve('other', '20')).toBe('20');

    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
      'The tool-versions data has no other release matching 20, 20 is used as is (embedded, possibly outdated tool-versions data)',
    );
  });

  test('warns and keeps a two-part version of another tool which the data does not list', async () => {
    serve('other', 200, ['6.3.2', '6.3']);

    expect(await svc.resolve('other', '6.4')).toBe('6.4');

    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
      'The tool-versions data has no other release matching 6.4, 6.4 is used as is',
    );
  });

  test('keeps a two-part swift release which the data does not list yet without a warning', async () => {
    serve('swift', 200, ['6.3.2', '6.3', '6.2']);

    expect(await svc.resolve('swift', '6.4')).toBe('6.4');

    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      { tool: 'swift', version: '6.4' },
      'two-part version not listed in the tool-versions data, used as is',
    );
  });

  test('warns about a listed two-part swift release which is not available for the host', async () => {
    serve('swift', 200, [{ version: '6.3', archs: ['arm64'] }]);

    expect(await svc.resolve('swift', '6.3')).toBe('6.3');

    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
      'No swift release matches 6.3 for amd64 on jammy, 6.3 is used as is',
    );
  });

  test('warns about a two-part swift line whose releases are not available for the host', async () => {
    serve('swift', 200, [
      { version: '6.2.3', archs: ['arm64'] },
      { version: '6.2.1', archs: ['arm64'] },
    ]);

    expect(await svc.resolve('swift', '6.2')).toBe('6.2');

    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
      'No swift release matches 6.2 for amd64 on jammy, 6.2 is used as is',
    );
  });

  test.each([
    { version: '6.3', resolved: '6.3' },
    { version: '6', resolved: '6.3.2' },
  ])(
    'resolves the swift version $version from the data',
    async ({ version, resolved }) => {
      serve('swift', 200, ['6.3.2', '6.3', '6.2']);

      expect(await svc.resolve('swift', version)).toBe(resolved);
    },
  );

  test('warns and keeps a one-part swift version without a match', async () => {
    serve('swift', 200, ['6.3.2', '6.3']);

    expect(await svc.resolve('swift', '7')).toBe('7');

    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
      'The tool-versions data has no swift release matching 7, 7 is used as is',
    );
  });

  test('warns and keeps a partial version which only prereleases match', async () => {
    serve('other', 200, versions);

    expect(await svc.resolve('other', '21')).toBe('21');

    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
      'No other release matches 21, only prereleases like 21.0.0-rc1 do, 21 is used as is, install an exact prerelease version instead',
    );
  });

  test('warns and keeps a partial version whose release is not available for the host', async () => {
    serve('other', 200, [
      '21.0.0-rc1',
      { version: '21.0.0', archs: ['arm64'] },
      '20.0.0',
    ]);

    expect(await svc.resolve('other', '21')).toBe('21');

    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
      'No other release matches 21 for amd64 on jammy, 21 is used as is',
    );
  });

  test('warns and keeps latest when the data only has prereleases', async () => {
    serve('other', 200, ['2.0.0-rc1']);

    expect(await svc.resolve('other', 'latest')).toBe('latest');

    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
      'No other release matches latest, only prereleases like 2.0.0-rc1 do, latest is used as is, install an exact prerelease version instead',
    );
  });

  test('warns when the data has no release at all', async () => {
    serve('other', 200, {
      tool: 'other',
      updatedAt: '2026-10-16T00:00:00Z',
      versions: [],
    });

    expect(await svc.resolve('other', undefined)).toBeUndefined();

    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
      'The tool-versions data has no other release matching latest, no version is resolved',
    );
  });

  test('warns and keeps a partial version when the embedded data needs a newer containerbase', async () => {
    await embed('other', ['3.12.5'], [{ version: '3.12.5', cb: '15.0.0' }]);
    serve('other', 404);

    expect(await svc.resolve('other', '3.12')).toBe('3.12');

    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
      'other 3.12.5 needs containerbase 15.0.0 or newer, running 14.51.0, 3.12 is used as is (embedded, possibly outdated tool-versions data)',
    );
  });

  test.each([undefined, 'latest', '2'])(
    'keeps %s of a tool without any data',
    async (version) => {
      serve('other', 404);

      expect(await svc.resolve('other', version)).toBe(version);
      expect(logger.warn).not.toHaveBeenCalled();
    },
  );

  test('skips a newest release which is only available for another arch', async () => {
    serve('other', 200, [
      { version: '3.0.0', archs: ['arm64'] },
      { version: '2.0.0', archs: ['amd64', 'arm64'] },
      '1.0.0',
    ]);

    expect(await svc.resolve('other', 'latest')).toBe('2.0.0');
  });

  test('picks a release for the arm64 host', async () => {
    vi.mocked(arch).mockReturnValue('arm64');
    child = createContainer();
    // the shared env service already read the arch
    child.bind(EnvService).toSelf();
    child.bind(ToolVersionResolverService).toSelf();
    child.bind(TOOL_VERSION_RESOLVER).to(DummyVersionResolver);
    svc = await child.getAsync(ToolVersionResolverService);
    serve('other', 200, [
      { version: '3.0.0', archs: ['amd64'] },
      { version: '2.0.0', archs: ['arm64'] },
    ]);

    expect(await svc.resolve('other', undefined)).toBe('2.0.0');
  });

  test('skips a release which is only available for another distro', async () => {
    serve('other', 200, [
      { version: '3.0.0', distros: ['noble', 'resolute'] },
      { version: '2.0.0', distros: ['jammy', 'noble'] },
      '1.0.0',
    ]);

    expect(await svc.resolve('other', undefined)).toBe('2.0.0');
  });

  test('uses the builds of an older distro when the tool has none for the host distro', async () => {
    vi.mocked(getDistro).mockResolvedValue({
      name: 'Ubuntu',
      versionCode: 'noble',
      versionId: '24.04',
    });
    serve('other', 200, [
      { version: '3.0.0', distros: ['jammy'] },
      { version: '2.0.0', distros: ['jammy'] },
    ]);

    expect(await svc.resolve('other', undefined)).toBe('3.0.0');
  });

  test('uses older distro builds when the host distro builds are for another arch', async () => {
    vi.mocked(arch).mockReturnValue('arm64');
    child = createContainer();
    // the shared env service already read the arch
    child.bind(EnvService).toSelf();
    child.bind(ToolVersionResolverService).toSelf();
    child.bind(TOOL_VERSION_RESOLVER).to(DummyVersionResolver);
    svc = await child.getAsync(ToolVersionResolverService);
    vi.mocked(getDistro).mockResolvedValue({
      name: 'Ubuntu',
      versionCode: 'noble',
      versionId: '24.04',
    });
    serve('other', 200, [
      { version: '3.0.0', archs: ['amd64'], distros: ['jammy', 'noble'] },
      { version: '2.0.0', archs: ['amd64', 'arm64'], distros: ['jammy'] },
    ]);

    expect(await svc.resolve('other', undefined)).toBe('2.0.0');
  });

  test('skips the builds of a newer distro on an older host', async () => {
    serve('other', 200, [
      { version: '3.0.0', distros: ['resolute'] },
      { version: '2.0.0', distros: ['noble'] },
    ]);

    expect(await svc.resolve('other', 'latest')).toBe('latest');

    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
      'No other release matches latest for amd64 on jammy, latest is used as is',
    );
  });

  test('uses the builds of an older distro for the releases without host distro builds', async () => {
    vi.mocked(getDistro).mockResolvedValue({
      name: 'Ubuntu',
      versionCode: 'noble',
      versionId: '24.04',
    });
    serve('other', 200, [
      { version: '5.10.1', distros: ['jammy', 'noble'] },
      { version: '5.9.2', distros: ['jammy'] },
    ]);

    expect(await svc.resolve('other', '5.9')).toBe('5.9.2');
  });

  test('only uses the host distro builds when the tool has a floor there', async () => {
    vi.mocked(getDistro).mockResolvedValue({
      name: 'Ubuntu',
      versionCode: 'resolute',
      versionId: '26.04',
    });
    serve('other', 200, {
      tool: 'other',
      updatedAt: '2026-10-16T00:00:00Z',
      distroMinVersion: { resolute: '6.4.0' },
      versions: [
        { version: '6.4.0', distros: ['jammy', 'noble', 'resolute'] },
        { version: '6.3.0', distros: ['jammy', 'noble'] },
      ],
    });

    expect(await svc.resolve('other', '6.3')).toBe('6.3');

    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
      'No other release matches 6.3 for amd64 on resolute, 6.3 is used as is',
    );
  });

  test('picks a release without archs and distros lists', async () => {
    serve('other', 200, [
      { version: '2.0.0', archs: ['arm64'] },
      { version: '1.0.0' },
    ]);

    expect(await svc.resolve('other', 'latest')).toBe('1.0.0');
  });

  test('skips an lts release which is not available for the host', async () => {
    serve('other', 200, [
      { version: '24.1.0', lts: true, distros: ['noble'] },
      { version: '22.1.0', lts: true },
      '25.0.0',
    ]);

    expect(await svc.resolve('other', 'latest')).toBe('22.1.0');
  });

  test.each([
    { name: 'arch', limit: { archs: ['arm64'] } },
    { name: 'distro', limit: { distros: ['noble'] } },
  ])(
    'keeps latest when no lts release is available for the host $name',
    async ({ limit }) => {
      serve('other', 200, [
        { version: '24.1.0', lts: true, ...limit },
        '25.0.0',
        '23.0.0',
      ]);

      expect(await svc.resolve('other', 'latest')).toBe('latest');

      expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
        'No other release matches latest for amd64 on jammy, latest is used as is',
      );
    },
  );

  test('resolves a partial version to a release available for the host', async () => {
    serve('other', 200, [
      { version: '3.12.5', archs: ['arm64'] },
      { version: '3.12.4', distros: ['noble'] },
      '3.12.3',
      '3.11.9',
    ]);

    expect(await svc.resolve('other', '3.12')).toBe('3.12.3');
  });

  test('looks a listed release up online when the embedded data has it not for the host', async () => {
    await embed('other', [{ version: '8.10', archs: ['arm64'] }]);
    serve('other', 200, ['8.10.2', '8.9.1']);

    expect(await svc.resolve('other', '8.10')).toBe('8.10.2');
  });

  test('warns and resolves no version for a missing version when no release is available for the host', async () => {
    serve('other', 200, [{ version: '3.0.0', archs: ['arm64'] }]);

    expect(await svc.resolve('other', undefined)).toBeUndefined();

    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
      'No other release matches latest for amd64 on jammy, no version is resolved',
    );
  });

  test('skips the versions from the start of a range which needs a newer containerbase', async () => {
    serve(
      'other',
      200,
      ['3.0.0', '2.0.0', '1.0.0'],
      [{ version: '2.0.0', cb: '14.52.0' }],
    );

    // the range covers 2.0.0 and the 3.0.0 above it, not 1.0.0
    expect(await svc.resolve('other', 'latest')).toBe('1.0.0');
  });

  test.each(['14.51.0', '14.50.0'])(
    'picks the versions of a range with the cb %s',
    async (cb) => {
      serve('other', 200, ['2.0.0', '1.0.0'], [{ version: '1.0.0', cb }]);

      expect(await svc.resolve('other', undefined)).toBe('2.0.0');
    },
  );

  test('applies the highest cb of the ranges which cover a version', async () => {
    serve(
      'other',
      200,
      ['4.0.0', '3.0.0', '2.0.0', '1.0.0'],
      [
        { version: '1.0.0', cb: '14.0.0' },
        { version: '3.0.0', cb: '14.52.0' },
        { version: '2.0.0', cb: '14.51.1' },
      ],
    );

    // 14.51.1 of the range at 2.0.0 is the highest one covering 2.0.0
    expect(await svc.resolve('other', 'latest')).toBe('1.0.0');
  });

  test('keeps the versions below a range which needs a newer containerbase', async () => {
    serve(
      'other',
      200,
      ['3.0.0', '2.0.0', '1.0.0'],
      [
        { version: '3.0.0', cb: '14.52.0' },
        { version: '1.0.0', cb: '14.0.0' },
      ],
    );

    // 3.0.0 is skipped, 2.0.0 is covered by the met range only
    expect(await svc.resolve('other', 'latest')).toBe('2.0.0');
  });

  test('ignores a range whose version is not listed', async () => {
    serve(
      'other',
      200,
      ['2.0.0', '1.0.0'],
      [{ version: '9.9.9', cb: '99.0.0' }],
    );

    expect(await svc.resolve('other', 'latest')).toBe('2.0.0');
  });

  test('counts the position of a prerelease for the coverage of a range', async () => {
    serve(
      'other',
      200,
      ['3.0.0', '2.0.0-rc1', '2.0.0', '1.0.0'],
      [{ version: '2.0.0-rc1', cb: '14.52.0' }],
    );

    expect(await svc.resolve('other', 'latest')).toBe('2.0.0');
  });

  test.each([
    '0.0.0-PLACEHOLDER',
    '0.0.0-PLACEHOLDER+2fc9e007c5f1d2a3b4c5d6e7f8091a2b3c4d5e6f',
  ])('skips no release on the development build %s', async (cb) => {
    vi.stubGlobal('CONTAINERBASE_VERSION', cb);
    serve(
      'other',
      200,
      ['3.0.0', '2.0.0', '1.0.0'],
      [
        { version: '3.0.0', cb: '99.0.0' },
        { version: '2.0.0', cb: 'invalid' },
      ],
    );

    expect(await svc.resolve('other', 'latest')).toBe('3.0.0');
  });

  test('skips the versions of a range with an invalid cb', async () => {
    serve('other', 200, ['2.0.0', '1.0.0'], [{ version: '2.0.0', cb: 'new' }]);

    expect(await svc.resolve('other', 'latest')).toBe('1.0.0');
  });

  test('resolves a partial version to a release which the running containerbase can install', async () => {
    serve(
      'other',
      200,
      ['3.12.5', '3.12.4', '3.11.9'],
      [{ version: '3.12.5', cb: '15.0.0' }],
    );

    expect(await svc.resolve('other', '3.12')).toBe('3.12.4');
  });

  test('warns and keeps latest when every lts release needs a newer containerbase', async () => {
    serve(
      'other',
      200,
      ['25.0.0', { version: '24.1.0', lts: true }],
      [{ version: '24.1.0', cb: '15.0.0' }],
    );

    // the range covers its version 24.1.0 and 25.0.0 listed above it
    expect(await svc.resolve('other', 'latest')).toBe('latest');

    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
      'other 24.1.0 needs containerbase 15.0.0 or newer, running 14.51.0, latest is used as is',
    );
  });

  test('names the highest cb of the unmet ranges which cover the skipped release', async () => {
    serve(
      'other',
      200,
      ['3.0.0', '2.1.0', '2.0.0'],
      [
        { version: '3.0.0', cb: '16.0.0' },
        { version: '2.1.0', cb: '15.0.0' },
        { version: '2.0.0', cb: '15.1.0' },
      ],
    );

    expect(await svc.resolve('other', '2')).toBe('2');

    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
      'other 2.1.0 needs containerbase 15.1.0 or newer, running 14.51.0, 2 is used as is',
    );
  });

  test('warns about a newer containerbase when no cb of the covering ranges is valid', async () => {
    serve(
      'other',
      200,
      ['2.0.0'],
      [
        { version: '2.0.0', cb: '' },
        { version: '2.0.0', cb: 'new' },
      ],
    );

    expect(await svc.resolve('other', 'latest')).toBe('latest');

    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
      'other 2.0.0 needs a newer containerbase, running 14.51.0, latest is used as is',
    );
  });

  test('warns about a newer containerbase when an invalid cb covers the release next to a valid one', async () => {
    serve(
      'other',
      200,
      ['2.0.0'],
      [
        { version: '2.0.0', cb: '15.0.0' },
        { version: '2.0.0', cb: 'new' },
      ],
    );

    expect(await svc.resolve('other', 'latest')).toBe('latest');

    // an invalid cb is never met, so it wins over the valid one
    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
      'other 2.0.0 needs a newer containerbase, running 14.51.0, latest is used as is',
    );
  });

  test('warns and keeps a listed two-part swift version which needs a newer containerbase', async () => {
    serve('swift', 200, ['6.3'], [{ version: '6.3', cb: '15.0.0' }]);

    expect(await svc.resolve('swift', '6.3')).toBe('6.3');

    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
      'swift 6.3 needs containerbase 15.0.0 or newer, running 14.51.0, 6.3 is used as is',
    );
  });

  test('skips the versions of a range with an empty cb', async () => {
    serve('other', 200, ['2.0.0', '1.0.0'], [{ version: '2.0.0', cb: '' }]);

    expect(await svc.resolve('other', 'latest')).toBe('1.0.0');
  });

  test('logs the unmet ranges once at debug level', async () => {
    serve(
      'other',
      200,
      ['3.0.0', '2.0.0', '1.0.0'],
      [
        { version: '3.0.0', cb: '14.52.0' },
        { version: '2.0.0', cb: '14.51.1' },
      ],
    );

    expect(await svc.resolve('other', 'latest')).toBe('1.0.0');

    const skipped = vi
      .mocked(logger.debug)
      .mock.calls.filter(
        ([, msg]) =>
          msg === 'skipping the versions which need a newer containerbase',
      );
    expect(skipped).toEqual([
      [
        { tool: 'other', running: '14.51.0', needed: ['14.52.0', '14.51.1'] },
        'skipping the versions which need a newer containerbase',
      ],
    ]);
  });

  test('does not log an unmet range which does not change the result', async () => {
    serve(
      'other',
      200,
      ['4.0.0', '3.12.5', '3.12.4'],
      [{ version: '4.0.0', cb: '14.52.0' }],
    );

    expect(await svc.resolve('other', '3.12')).toBe('3.12.5');

    expect(logger.debug).not.toHaveBeenCalledWith(
      expect.anything(),
      'skipping the versions which need a newer containerbase',
    );
  });

  test('looks a listed release up online when the embedded data needs a newer containerbase', async () => {
    await embed('other', ['8.10'], [{ version: '8.10', cb: '14.52.0' }]);
    serve('other', 200, ['8.10.2', '8.9.1']);

    expect(await svc.resolve('other', '8.10')).toBe('8.10.2');
  });

  test.each(['1.2.3', '21.0.0-rc1'])(
    'keeps the exact version %s the embedded data lists without the online lookup',
    async (version) => {
      await embed(
        'other',
        ['21.0.0-rc1', '1.2.3', '1.0.0'],
        [{ version: '1.0.0', cb: '14.0.0' }],
      );
      // no online mock: a request would fail the test
      const online = vi.spyOn(HttpService.prototype, 'getJson');

      expect(await svc.resolve('other', version)).toBe(version);

      expect(online).not.toHaveBeenCalled();
      expect(getDistro).not.toHaveBeenCalled();
    },
  );

  test('keeps an exact version which is only available for another host', async () => {
    await embed('other', [{ version: '1.2.3', archs: ['arm64'] }]);

    expect(await svc.resolve('other', '1.2.3')).toBe('1.2.3');
  });

  test.each(['1.2.3', '21.0.0-rc1'])(
    'warns and keeps the exact version %s the embedded data lists as needing a newer containerbase',
    async (version) => {
      await embed(
        'other',
        ['21.0.0-rc1', '1.2.3', '1.0.0'],
        [{ version: '1.2.3', cb: '15.0.0' }],
      );

      expect(await svc.resolve('other', version)).toBe(version);

      expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
        `other ${version} needs containerbase 15.0.0 or newer, running 14.51.0, ${version} is used as is`,
      );
    },
  );

  test('keeps an exact version listed below an unmet range without a warning', async () => {
    await embed(
      'other',
      ['1.2.3', '1.0.0'],
      [{ version: '1.2.3', cb: '15.0.0' }],
    );

    expect(await svc.resolve('other', '1.0.0')).toBe('1.0.0');

    expect(logger.warn).not.toHaveBeenCalled();
  });

  test.each(['1.2.4', '1.3.0-rc1'])(
    'keeps the exact version %s which the embedded data does not list without the online lookup',
    async (version) => {
      await embed('other', ['1.2.3'], [{ version: '1.2.3', cb: '15.0.0' }]);
      // no online mock: a request would fail the test
      const online = vi.spyOn(HttpService.prototype, 'getJson');

      expect(await svc.resolve('other', version)).toBe(version);

      expect(online).not.toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
    },
  );

  test('keeps an exact version of a tool without embedded data without the online lookup', async () => {
    const online = vi.spyOn(HttpService.prototype, 'getJson');

    expect(await svc.resolve('other', '1.2.3')).toBe('1.2.3');

    expect(online).not.toHaveBeenCalled();
  });

  test('makes no request and reads no data for an exact version on a development build', async () => {
    vi.stubGlobal('CONTAINERBASE_VERSION', '0.0.0-PLACEHOLDER');
    const embedded = vi.spyOn(ToolVersionsService.prototype, 'getVersions');
    const online = vi.spyOn(HttpService.prototype, 'getJson');

    expect(await svc.resolve('other', '1.2.3')).toBe('1.2.3');

    expect(embedded).not.toHaveBeenCalled();
    expect(online).not.toHaveBeenCalled();
    expect(getDistro).not.toHaveBeenCalled();
  });
});

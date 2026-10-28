import { mkdir, rm, writeFile } from 'node:fs/promises';
import { arch } from 'node:os';
import { type Container, injectFromHierarchy, injectable } from 'inversify';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  EnvService,
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
    svc = await child.getAsync(ToolVersionResolverService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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
    const online = vi.spyOn(ToolVersionsService.prototype, 'getOnlineVersions');
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
      const online = vi.spyOn(
        ToolVersionsService.prototype,
        'getOnlineVersions',
      );

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
    const online = vi.spyOn(ToolVersionsService.prototype, 'getOnlineVersions');

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

    expect(logger.debug).toHaveBeenCalledWith(
      { tool: 'other', running: '14.51.0', needed: ['14.52.0', '14.51.1'] },
      'skipping the versions which need a newer containerbase',
    );
    expect(logger.debug).toHaveBeenCalledTimes(2);
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
      const online = vi.spyOn(
        ToolVersionsService.prototype,
        'getOnlineVersions',
      );

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
      const online = vi.spyOn(
        ToolVersionsService.prototype,
        'getOnlineVersions',
      );

      expect(await svc.resolve('other', version)).toBe(version);

      expect(online).not.toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
    },
  );

  test('keeps an exact version of a tool without embedded data without the online lookup', async () => {
    const online = vi.spyOn(ToolVersionsService.prototype, 'getOnlineVersions');

    expect(await svc.resolve('other', '1.2.3')).toBe('1.2.3');

    expect(online).not.toHaveBeenCalled();
  });

  test('makes no request and reads no data for an exact version on a development build', async () => {
    vi.stubGlobal('CONTAINERBASE_VERSION', '0.0.0-PLACEHOLDER');
    const embedded = vi.spyOn(ToolVersionsService.prototype, 'getVersions');
    const online = vi.spyOn(ToolVersionsService.prototype, 'getOnlineVersions');

    expect(await svc.resolve('other', '1.2.3')).toBe('1.2.3');

    expect(embedded).not.toHaveBeenCalled();
    expect(online).not.toHaveBeenCalled();
    expect(getDistro).not.toHaveBeenCalled();
  });
});

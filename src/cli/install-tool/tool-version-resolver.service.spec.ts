import { mkdir, rm, writeFile } from 'node:fs/promises';
import { arch } from 'node:os';
import { type Container, injectFromHierarchy, injectable } from 'inversify';
import { beforeEach, describe, expect, test, vi } from 'vitest';
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
  | { version: string; lts?: true; archs?: string[]; distros?: string[] };

/**
 * The content of a `<tool>.json` file.
 * @param tool - the tool name
 * @param list - the versions, a `-rc` one is a prerelease, a `-lts` one is an
 * LTS release, the suffix is not part of the version
 */
function toolFile(tool: string, list: Entry[]): object {
  return {
    tool,
    updatedAt: '2026-10-16T00:00:00Z',
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
 */
async function embed(tool: string, list: Entry[]): Promise<void> {
  await writeFile(`${dir}/${tool}.json`, JSON.stringify(toolFile(tool, list)));
}

/**
 * Mocks the online file of a tool.
 * @param tool - the tool name
 * @param status - the http status to reply with
 * @param body - a list of versions for a tool file, or the raw reply
 */
function serve(
  tool: string,
  status: number,
  body?: Entry[] | string | object,
): void {
  scope('https://containerbase.github.io')
    .get(`/tool-versions/v1/${tool}.json`)
    .reply(status, Array.isArray(body) ? toolFile(tool, body) : body);
}

describe('cli/install-tool/tool-version-resolver.service', () => {
  let child!: Container;
  let svc!: ToolVersionResolverService;

  beforeEach(async () => {
    dir = rootPath('usr/local/containerbase/tool-versions/v1');
    // no embedded data unless a test writes it
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });

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
    svc = await child.getAsync(ToolVersionResolverService);
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
    // no release of that line
    { version: '21', resolved: '21' },
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

  test('keeps the version when the online data has no match, without the embedded data', async () => {
    await embed('other', ['20.1.0']);
    serve('other', 200, ['19.0.0']);

    expect(await svc.resolve('other', '20')).toBe('20');

    expect(logger.warn).not.toHaveBeenCalled();
  });

  test('keeps the version when the embedded data has no match either', async () => {
    await embed('other', ['19.0.0']);
    serve('other', 404);

    expect(await svc.resolve('other', '20')).toBe('20');

    expect(logger.warn).not.toHaveBeenCalled();
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

  test('keeps the version when no release is available for the host', async () => {
    serve('other', 200, [{ version: '3.0.0', archs: ['arm64'] }]);

    expect(await svc.resolve('other', 'latest')).toBe('latest');
  });

  test('makes no request and reads no data for an exact version', async () => {
    const embedded = vi.spyOn(ToolVersionsService.prototype, 'getVersions');
    const online = vi.spyOn(ToolVersionsService.prototype, 'getOnlineVersions');

    expect(await svc.resolve('other', '1.2.3')).toBe('1.2.3');

    expect(embedded).not.toHaveBeenCalled();
    expect(online).not.toHaveBeenCalled();
    expect(getDistro).not.toHaveBeenCalled();
  });
});

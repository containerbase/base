import { mkdir, rm, writeFile } from 'node:fs/promises';
import { type Container, injectFromHierarchy, injectable } from 'inversify';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ToolVersionsService, createContainer } from '../services/index.ts';
import { logger } from '../utils/index.ts';
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

/**
 * The content of a `<tool>.json` file.
 * @param tool - the tool name
 * @param list - the versions, a `-rc` one is a prerelease, a `-lts` one is an
 * LTS release, the suffix is not part of the version
 */
function toolFile(tool: string, list: string[]): object {
  return {
    tool,
    updatedAt: '2026-10-16T00:00:00Z',
    versions: list.map((entry) => {
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
async function embed(tool: string, list: string[]): Promise<void> {
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
  body?: string[] | string | object,
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

  describe('installable versions', () => {
    /** Accepts only versions with three parts. */
    const threeParts = (version: string): boolean =>
      version.split('.').length === 3;
    const lookup = (): Promise<(version: string) => boolean> =>
      Promise.resolve(threeParts);

    test.each([undefined, 'latest'])(
      'resolves %s to the newest installable release',
      async (version) => {
        serve('other', 200, ['0.6.0.1', '0.6.0', '0.5.0']);

        expect(await svc.resolve('other', version, lookup)).toBe('0.6.0');

        expect(logger.debug).toHaveBeenCalledWith(
          { tool: 'other', version: '0.6.0.1' },
          'release skipped, not installable',
        );
      },
    );

    test('resolves latest to the newest installable lts release', async () => {
      serve('other', 200, ['3.0.0.1', '2.0.0.1-lts', '2.0.0-lts', '1.0.0-lts']);

      expect(await svc.resolve('other', 'latest', lookup)).toBe('2.0.0');
    });

    test('skips releases which are not installable for a partial version', async () => {
      serve('other', 200, ['0.6.0.1', '0.6.0', '0.5.0']);

      expect(await svc.resolve('other', '0.6', lookup)).toBe('0.6.0');
    });

    test('does not return a listed release which is not installable', async () => {
      await embed('other', ['8.10', '8.9.1']);
      serve('other', 200, ['8.10.1', '8.10', '8.9.1']);

      expect(await svc.resolve('other', '8.10', lookup)).toBe('8.10.1');
    });

    test('keeps the version when no release is installable', async () => {
      serve('other', 200, ['0.6.0.1', '0.5.0.1']);

      expect(await svc.resolve('other', 'latest', lookup)).toBe('latest');
    });

    test('skips releases of the embedded data which are not installable', async () => {
      await embed('other', ['0.6.0.1', '0.6.0']);
      serve('other', 404);

      expect(await svc.resolve('other', undefined, lookup)).toBe('0.6.0');
    });

    test('does not check a tool without a check', async () => {
      serve('other', 200, ['0.6.0.1', '0.6.0']);

      expect(
        await svc.resolve('other', 'latest', () => Promise.resolve(undefined)),
      ).toBe('0.6.0.1');
    });

    test('does not look up the check for a tool with a resolver', async () => {
      const spy = vi.fn(lookup);

      expect(await svc.resolve('dummy', 'latest', spy)).toBe('1.2.3');

      expect(spy).not.toHaveBeenCalled();
    });

    test('does not look up the check for an exact version', async () => {
      const spy = vi.fn(lookup);

      expect(await svc.resolve('other', '0.6.0.1', spy)).toBe('0.6.0.1');

      expect(spy).not.toHaveBeenCalled();
    });
  });

  test('makes no request and reads no data for an exact version', async () => {
    const embedded = vi.spyOn(ToolVersionsService.prototype, 'getVersions');
    const online = vi.spyOn(ToolVersionsService.prototype, 'getOnlineVersions');

    expect(await svc.resolve('other', '1.2.3')).toBe('1.2.3');

    expect(embedded).not.toHaveBeenCalled();
    expect(online).not.toHaveBeenCalled();
  });
});

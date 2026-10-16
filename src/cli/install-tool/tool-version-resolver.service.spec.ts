import { mkdir, rm, writeFile } from 'node:fs/promises';
import { type Container, injectFromHierarchy, injectable } from 'inversify';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ToolVersionsService, createContainer } from '../services/index.ts';
import { JavaVersionResolver } from '../tools/java/resolver.ts';
import { MiseVersionResolver } from '../tools/mise.ts';
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

@injectable()
@injectFromHierarchy()
class FailingVersionResolver extends ToolVersionResolver {
  readonly tool = 'failing';

  /** Fails like an unreachable upstream. */
  resolve(): Promise<string | undefined> {
    return Promise.reject(new Error('upstream down'));
  }
}

/** The embedded `v1` folder, set before each test as the root dir comes from the test setup. */
let dir!: string;

/** Versions of a tool, newest first, a `-rc` one is a prerelease. */
const versions = [
  '21.0.0-rc1',
  '20.10.0',
  '20.9.0',
  '8.10',
  '8.10.1',
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
 * @param times - how often the file is requested
 */
function serve(
  tool: string,
  status: number,
  body?: string[] | string | object,
  times = 1,
): void {
  scope('https://containerbase.github.io')
    .get(`/tool-versions/v1/${tool}.json`)
    .times(times)
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
    child.bind(TOOL_VERSION_RESOLVER).to(FailingVersionResolver);
    child.bind(TOOL_VERSION_RESOLVER).to(JavaVersionResolver);
    child.bind(TOOL_VERSION_RESOLVER).to(MiseVersionResolver);
    svc = await child.getAsync(ToolVersionResolverService);
  });

  test('resolves with the matching resolver', async () => {
    expect(await svc.resolve('dummy', 'latest')).toBe('1.2.3');
    expect(await svc.resolve('dummy', '1.0.0')).toBe('1.0.0');
  });

  test('falls back to the given version', async () => {
    // no resolver for this tool
    expect(await svc.resolve('other', '1.0.0')).toBe('1.0.0');
    // the resolver returned nothing
    expect(await svc.resolve('dummy', undefined)).toBeUndefined();
  });

  test('does not read the embedded data when the resolver works', async () => {
    const spy = vi.spyOn(ToolVersionsService.prototype, 'getVersions');

    expect(await svc.resolve('dummy', 'latest')).toBe('1.2.3');

    expect(spy).not.toHaveBeenCalled();
  });

  test.each([undefined, 'latest'])(
    'uses the newest embedded release for %s when the resolver fails',
    async (version) => {
      await embed('failing', ['3.0.0-rc1', '2.0.0', '1.0.0']);

      expect(await svc.resolve('failing', version)).toBe('2.0.0');
    },
  );

  test.each([undefined, 'latest'])(
    'uses the newest embedded lts release for %s when the resolver fails',
    async (version) => {
      await embed('failing', [
        '26.0.0-rc1',
        '25.0.0',
        '24.11.0-lts',
        '24.10.0-lts',
        '23.0.0',
      ]);

      expect(await svc.resolve('failing', version)).toBe('24.11.0');
    },
  );

  test.each([
    { version: '2', resolved: '2.1.0' },
    { version: '2.0', resolved: '2.0.5' },
  ])(
    'uses the newest embedded release of the line $version when the resolver fails',
    async ({ version, resolved }) => {
      await embed('failing', ['3.0.0', '2.1.0', '2.0.5', '2.0.4', '1.0.0']);

      expect(await svc.resolve('failing', version)).toBe(resolved);
    },
  );

  test('resolves a listed exact version without the resolver', async () => {
    await embed('dummy', ['2.0.0', '1.0.0']);
    const spy = vi.spyOn(DummyVersionResolver.prototype, 'resolve');

    expect(await svc.resolve('dummy', '1.0.0')).toBe('1.0.0');

    expect(spy).not.toHaveBeenCalled();
  });

  test('does not call a failing resolver for a listed exact version', async () => {
    await embed('failing', ['2.0.0', '1.0.0']);

    expect(await svc.resolve('failing', '1.0.0')).toBe('1.0.0');
  });

  test.each(['9.9.9', '2', '2.0', 'latest', undefined])(
    'asks the resolver for %s, which the embedded data does not list as exact version',
    async (version) => {
      await embed('dummy', ['2.0.0', '1.0.0']);
      const spy = vi.spyOn(DummyVersionResolver.prototype, 'resolve');

      await svc.resolve('dummy', version);

      expect(spy).toHaveBeenCalledOnce();
    },
  );

  test('resolves a listed java version with a build from the embedded data', async () => {
    await embed('java', ['11.0.24+8']);
    const spy = vi
      .spyOn(JavaVersionResolver.prototype, 'resolve')
      .mockResolvedValue('11.0.24+8');

    expect(await svc.resolve('java', '11.0.24+8')).toBe('11.0.24+8');

    expect(spy).not.toHaveBeenCalled();
  });

  test('asks the java resolver for a version without a build', async () => {
    // only the version with its build is listed
    await embed('java', ['11.0.24+8']);
    const spy = vi
      .spyOn(JavaVersionResolver.prototype, 'resolve')
      .mockResolvedValue('11.0.24+8');

    expect(await svc.resolve('java', '11.0.24')).toBe('11.0.24+8');

    expect(spy).toHaveBeenCalledOnce();
  });

  test('uses the embedded data when the lookup fails with an http error', async () => {
    await embed('mise', ['2026.2.13', '2026.2.12']);
    scope('https://mise.jdx.dev').get('/VERSION').reply(404);

    expect(await svc.resolve('mise', 'latest')).toBe('2026.2.13');
  });

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

  test('prefers the online data to an older embedded one', async () => {
    await embed('other', ['20.1.0']);
    serve('other', 200, versions);
    const spy = vi.spyOn(ToolVersionsService.prototype, 'getVersions');

    expect(await svc.resolve('other', '20')).toBe('20.10.0');

    expect(spy).not.toHaveBeenCalled();
  });

  test('uses the embedded data and warns when the online data is not available', async () => {
    await embed('other', versions);
    serve('other', 404);

    expect(await svc.resolve('other', '20')).toBe('20.10.0');

    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
      { tool: 'other', version: '20', resolved: '20.10.0' },
      expect.stringContaining('embedded'),
    );
  });

  test('uses the embedded data at once when the network is down', async () => {
    await embed('other', versions);
    // no retry, a second request would find no interceptor
    scope('https://containerbase.github.io')
      .get('/tool-versions/v1/other.json')
      .once()
      .replyWithError('connection reset');

    expect(await svc.resolve('other', '20')).toBe('20.10.0');
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
    const spy = vi.spyOn(ToolVersionsService.prototype, 'getVersions');

    expect(await svc.resolve('other', '20')).toBe('20');

    expect(spy).not.toHaveBeenCalled();
  });

  test('keeps a partial version without any data', async () => {
    serve('other', 404);

    expect(await svc.resolve('other', '20')).toBe('20');
    expect(logger.warn).not.toHaveBeenCalled();
  });

  test.each(['latest', '1.2.3', undefined])(
    'makes no request and reads no data for %s of a tool without a resolver',
    async (version) => {
      const embedded = vi.spyOn(ToolVersionsService.prototype, 'getVersions');
      const online = vi.spyOn(
        ToolVersionsService.prototype,
        'getOnlineVersions',
      );

      expect(await svc.resolve('other', version)).toBe(version);

      expect(embedded).not.toHaveBeenCalled();
      expect(online).not.toHaveBeenCalled();
    },
  );

  test('keeps the partial version of a tool with a working resolver', async () => {
    const spy = vi.spyOn(ToolVersionsService.prototype, 'getVersions');

    expect(await svc.resolve('dummy', '1')).toBe('1');

    expect(spy).not.toHaveBeenCalled();
  });

  test('throws when the embedded data does not list the version', async () => {
    await embed('failing', ['2.0.0']);

    await expect(svc.resolve('failing', '9.9.9')).rejects.toThrow(
      'upstream down',
    );
  });

  test('throws when there is no embedded data', async () => {
    await expect(svc.resolve('failing', 'latest')).rejects.toThrow(
      'upstream down',
    );
  });
});

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { type Container, injectFromHierarchy, injectable } from 'inversify';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ToolVersionsService, createContainer } from '../services/index.ts';
import { JavaVersionResolver } from '../tools/java/resolver.ts';
import { MiseVersionResolver } from '../tools/mise.ts';
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

/**
 * Writes the embedded versions of a tool, newest first.
 * @param tool - the tool name
 * @param versions - the versions, a `-rc` one is a prerelease, a `-lts` one
 * is an LTS release, the suffix is not part of the version
 */
async function embed(tool: string, versions: string[]): Promise<void> {
  await writeFile(
    `${dir}/${tool}.json`,
    JSON.stringify({
      tool,
      updatedAt: '2026-10-16T00:00:00Z',
      versions: versions.map((entry) => {
        const version = entry.replace(/-lts$/, '');
        if (entry.includes('-rc')) {
          return { version, prerelease: true };
        }
        return entry.endsWith('-lts') ? { version, lts: true } : { version };
      }),
    }),
  );
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

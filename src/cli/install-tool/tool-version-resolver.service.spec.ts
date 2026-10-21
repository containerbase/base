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
    svc = await child.getAsync(ToolVersionResolverService);
  });

  test('resolves with the matching resolver', async () => {
    expect(await svc.resolve('dummy', 'latest')).toBe('1.2.3');
    expect(await svc.resolve('dummy', '1.0.0')).toBe('1.0.0');
  });

  test('keeps the version when the resolver returns nothing', async () => {
    expect(await svc.resolve('dummy', undefined)).toBeUndefined();
  });

  test('does not read the embedded data for a tool with a resolver', async () => {
    await embed('dummy', ['2.0.0', '1.0.0']);
    const spy = vi.spyOn(ToolVersionsService.prototype, 'getVersions');

    expect(await svc.resolve('dummy', '2')).toBe('2');
    expect(await svc.resolve('dummy', undefined)).toBeUndefined();

    expect(spy).not.toHaveBeenCalled();
  });

  test.each([undefined, 'latest'])(
    'resolves %s of a tool without a resolver to the newest release',
    async (version) => {
      await embed('other', ['3.0.0-rc1', '2.0.0', '1.0.0']);

      expect(await svc.resolve('other', version)).toBe('2.0.0');

      expect(logger.debug).toHaveBeenCalledWith(
        { tool: 'other', version, resolved: '2.0.0' },
        'version resolved from the embedded tool-versions data',
      );
    },
  );

  test.each([undefined, 'latest'])(
    'resolves %s of a tool without a resolver to the newest lts release',
    async (version) => {
      await embed('other', [
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
    { version: '2', resolved: '2.1.0' },
    { version: '2.0', resolved: '2.0.5' },
    // a release itself stays as it is
    { version: '8.10', resolved: '8.10' },
    // no release of that line
    { version: '9', resolved: '9' },
  ])(
    'resolves the partial version $version of a tool without a resolver',
    async ({ version, resolved }) => {
      await embed('other', [
        '3.0.0-rc1',
        '3.0.0',
        '2.1.0',
        '2.0.5',
        '2.0.4',
        '8.10.1',
        '8.10',
        '1.0.0',
      ]);

      expect(await svc.resolve('other', version)).toBe(resolved);
    },
  );

  test('takes the newest release of a line in the order of the data', async () => {
    // the data is sorted by the versioning of the tool, which isn't compared
    await embed('other', ['2.0.9', '2.0.10', '1.0.0']);

    expect(await svc.resolve('other', '2')).toBe('2.0.9');
  });

  test('keeps an exact version of a tool without a resolver, listed or not', async () => {
    await embed('other', ['2.0.0']);
    const spy = vi.spyOn(ToolVersionsService.prototype, 'getVersions');

    expect(await svc.resolve('other', '2.0.0')).toBe('2.0.0');
    expect(await svc.resolve('other', '9.9.9')).toBe('9.9.9');

    expect(spy).not.toHaveBeenCalled();
  });

  test.each([undefined, 'latest', '2'])(
    'keeps %s of a tool without embedded data',
    async (version) => {
      expect(await svc.resolve('other', version)).toBe(version);
    },
  );
});

import fs from 'node:fs/promises';
import { join } from 'node:path';
import { type Container, injectFromHierarchy, injectable } from 'inversify';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  LinkToolService,
  PathService,
  VersionService,
} from '../../services/index.ts';
import { logger } from '../../utils/index.ts';
import { RubyBaseInstallService, RubyGemVersionResolver } from './utils.ts';
import { testContainer } from '~test/di.ts';
import { scope } from '~test/http-mock.ts';
import { ensurePaths } from '~test/path.ts';

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock('execa', () => ({ execa: execaMock }));

const rubyVersion = '3.4.1';

@injectable()
@injectFromHierarchy()
class BundlerInstallService extends RubyBaseInstallService {
  readonly name = 'bundler';
}

@injectable()
@injectFromHierarchy()
class BundlerVersionResolver extends RubyGemVersionResolver {
  readonly tool = 'bundler';
}

describe('cli/tools/ruby/utils', () => {
  let child!: Container;
  let pathSvc!: PathService;

  /**
   * Write the gemspec `gem install` would have created.
   */
  async function writeGemSpec(version: string, content: string): Promise<void> {
    const dir = join(
      pathSvc.versionedToolPath('bundler', version),
      rubyVersion,
      'specifications',
    );
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(join(dir, `bundler-${version}.gemspec`), content);
  }

  beforeAll(async () => {
    await ensurePaths([
      'tmp',
      'opt/containerbase/bin',
      'opt/containerbase/data',
      'opt/containerbase/versions',
    ]);

    const verSvc = await (await testContainer()).getAsync(VersionService);
    await verSvc.setCurrent({
      name: 'ruby',
      tool: { name: 'ruby', version: rubyVersion },
    });
  });

  beforeEach(async () => {
    child = await testContainer();
    child.bind(BundlerInstallService).toSelf();
    child.bind(BundlerVersionResolver).toSelf();
    pathSvc = await child.getAsync(PathService);
    execaMock.mockResolvedValue({ failed: false, all: 'ok' });
  });

  describe('RubyBaseInstallService', () => {
    test('install', async () => {
      const svc = await child.getAsync(BundlerInstallService);

      await expect(svc.install('2.5.0')).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledWith(
        join(pathSvc.versionedToolPath('ruby', rubyVersion), 'bin/gem'),
        expect.arrayContaining(['install', 'bundler', '--version', '2.5.0']),
        expect.objectContaining({ cwd: pathSvc.installDir }),
      );
    });

    test('install: reuses an existing tool path', async () => {
      const svc = await child.getAsync(BundlerInstallService);

      await pathSvc.createVersionedToolPath('bundler', '2.5.1');
      await expect(svc.install('2.5.1')).resolves.toBeUndefined();
    });

    test('install: uses the replaced gem source', async () => {
      vi.stubEnv('URL_REPLACE_0_FROM', 'https://rubygems.org/');
      vi.stubEnv('URL_REPLACE_0_TO', 'https://gems.example.com/');
      const svc = await child.getAsync(BundlerInstallService);

      await expect(svc.install('2.5.2')).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          '--clear-sources',
          '--source',
          'https://gems.example.com/',
        ]),
        expect.any(Object),
      );
    });

    test('install: throws and cleans up on failure', async () => {
      execaMock.mockResolvedValue({ failed: true, all: 'boom' });
      const svc = await child.getAsync(BundlerInstallService);

      await expect(svc.install('2.6.0')).rejects.toThrow(
        'gem install command failed',
      );
      expect(logger.warn).toHaveBeenCalledWith('Gem error:\nboom');
      await expect(
        fs.stat(
          join(pathSvc.versionedToolPath('bundler', '2.6.0'), rubyVersion),
        ),
      ).rejects.toThrow();
    });

    test('isInstalled', async () => {
      const svc = await child.getAsync(BundlerInstallService);

      expect(await svc.isInstalled('3.0.0')).toBe(false);
      await writeGemSpec('3.0.0', 's.executables = ["bundle"]');
      expect(await svc.isInstalled('3.0.0')).toBe(true);
    });

    test('link', async () => {
      const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');
      const svc = await child.getAsync(BundlerInstallService);
      await writeGemSpec(
        '3.1.0',
        'Gem::Specification.new do |s|\n  s.executables = ["bundle", "bundler"]\n  s.name = "bundler"\nend\n',
      );

      await expect(svc.link('3.1.0')).resolves.toBeUndefined();

      const path = join(
        pathSvc.versionedToolPath('bundler', '3.1.0'),
        rubyVersion,
      );
      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy).toHaveBeenCalledWith('bundler', {
        srcDir: join(path, 'bin'),
        name: 'bundle',
        exports: `GEM_PATH=$GEM_PATH:${path}`,
      });
    });

    test('link: missing executables', async () => {
      const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');
      const svc = await child.getAsync(BundlerInstallService);
      await writeGemSpec('3.2.0', 'Gem::Specification.new do |s|\nend\n');

      await expect(svc.link('3.2.0')).resolves.toBeUndefined();

      expect(spy).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
        {
          tool: 'bundler',
          version: '3.2.0',
          gemSpec: 'Gem::Specification.new do |s|\nend\n',
        },
        "Missing 'executables' in gemspec",
      );
    });

    test('runs the tool test', async () => {
      const svc = await child.getAsync(BundlerInstallService);

      await expect(svc.test('2.5.0')).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledWith(
        'bundler',
        ['--version'],
        expect.any(Object),
      );
    });

    test('throws without a current ruby', async () => {
      const verSvc = await child.getAsync(VersionService);
      await verSvc.removeCurrent('ruby');
      try {
        const svc = await child.getAsync(BundlerInstallService);
        await expect(svc.isInstalled('2.5.0')).rejects.toThrow(
          'Ruby not installed',
        );
      } finally {
        await verSvc.setCurrent({
          name: 'ruby',
          tool: { name: 'ruby', version: rubyVersion },
        });
      }
    });
  });

  describe('RubyGemVersionResolver', () => {
    test.each([{ version: undefined }, { version: 'latest' }])(
      'resolves $version',
      async ({ version }) => {
        scope('https://rubygems.org')
          .get('/api/v1/gems/bundler.json')
          .reply(200, { version: '2.5.11' });
        const resolver = await child.getAsync(BundlerVersionResolver);

        expect(await resolver.resolve(version)).toBe('2.5.11');
      },
    );

    test('keeps a pinned version', async () => {
      const resolver = await child.getAsync(BundlerVersionResolver);

      expect(await resolver.resolve('2.5.0')).toBe('2.5.0');
    });
  });
});

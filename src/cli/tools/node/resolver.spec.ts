import { arch } from 'node:os';
import { injectFromHierarchy, injectable } from 'inversify';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  NodeVersionResolver,
  NpmVersionResolver,
  YarnVersionResolver,
  createNpmVersionResolver,
} from './resolver.ts';
import { scope } from '~test/http-mock.ts';
import { toolContext } from '~test/tool.ts';

vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:os')>()),
  arch: vi.fn(() => 'x64'),
}));

const registryUrl = 'https://registry.npmjs.org';

@injectable()
@injectFromHierarchy()
class PnpmVersionResolver extends NpmVersionResolver {
  readonly tool = 'pnpm';
}

describe('cli/tools/node/resolver', () => {
  describe('NodeVersionResolver', () => {
    test.each([{ version: undefined }, { version: '' }, { version: 'latest' }])(
      'resolves $version to the latest lts',
      async ({ version }) => {
        scope('https://nodejs.org')
          .get('/dist/index.json')
          .reply(200, [
            { version: 'v23.3.0', lts: false },
            { version: 'v22.11.0', lts: 'Jod' },
          ]);
        const { svc } = await toolContext(NodeVersionResolver);

        expect(await svc.resolve(version)).toBe('22.11.0');
      },
    );

    test('keeps a pinned version', async () => {
      const { svc } = await toolContext(NodeVersionResolver);

      expect(await svc.resolve('22.11.0')).toBe('22.11.0');
    });

    describe('partial versions', () => {
      const index = [
        { version: 'v23.3.0', lts: false },
        { version: 'v22.11.0', lts: 'Jod' },
        { version: 'v20.18.1', lts: 'Iron' },
        { version: 'v22.10.0', lts: false },
        { version: 'v20.11.1', lts: 'Iron' },
        { version: 'v20.11.0', lts: 'Iron' },
      ];

      test.each([
        { version: '20', expected: '20.18.1' },
        { version: '20.11', expected: '20.11.1' },
        { version: '22', expected: '22.11.0' },
        { version: '23', expected: '23.3.0' },
      ])('resolves $version to $expected', async ({ version, expected }) => {
        scope('https://nodejs.org').get('/dist/index.json').reply(200, index);
        const { svc } = await toolContext(NodeVersionResolver);

        expect(await svc.resolve(version)).toBe(expected);
      });

      test.each(['2', '20.1', '24'])('throws for %s', async (version) => {
        scope('https://nodejs.org').get('/dist/index.json').reply(200, index);
        const { svc } = await toolContext(NodeVersionResolver);

        await expect(svc.resolve(version)).rejects.toThrow(
          `No node release found for version ${version}`,
        );
      });
    });
  });

  describe('NpmVersionResolver', () => {
    test('resolves latest', async () => {
      scope(registryUrl)
        .get('/pnpm')
        .reply(200, { name: 'pnpm', 'dist-tags': { latest: '9.14.2' } });
      const { svc } = await toolContext(PnpmVersionResolver);

      expect(await svc.resolve('latest')).toBe('9.14.2');
    });

    test('keeps a pinned version', async () => {
      const { svc } = await toolContext(PnpmVersionResolver);

      expect(await svc.resolve('9.14.2')).toBe('9.14.2');
    });

    describe('partial versions', () => {
      const meta = {
        name: 'pnpm',
        'dist-tags': { latest: '10.0.0' },
        versions: {
          '8.15.9': {},
          '9.0.0': {},
          '9.15.0': {},
          '9.15.4': {},
          '9.16.0-beta.1': {},
          '10.0.0': {},
        },
      };

      test.each([
        { version: '9', expected: '9.15.4' },
        { version: '9.15', expected: '9.15.4' },
        { version: '9.0', expected: '9.0.0' },
        { version: '10', expected: '10.0.0' },
      ])('resolves $version to $expected', async ({ version, expected }) => {
        scope(registryUrl).get('/pnpm').reply(200, meta);
        const { svc } = await toolContext(PnpmVersionResolver);

        expect(await svc.resolve(version)).toBe(expected);
      });

      test.each(['7', '9.14', '11'])('throws for %s', async (version) => {
        scope(registryUrl).get('/pnpm').reply(200, meta);
        const { svc } = await toolContext(PnpmVersionResolver);

        await expect(svc.resolve(version)).rejects.toThrow(
          `No pnpm release found for version ${version}`,
        );
      });
    });

    test('creates a resolver for a tool', async () => {
      scope(registryUrl)
        .get('/del-cli')
        .reply(200, { name: 'del-cli', 'dist-tags': { latest: '6.0.0' } });
      const { svc } = await toolContext(createNpmVersionResolver('del-cli'));

      expect(svc.tool).toBe('del-cli');
      expect(await svc.resolve(undefined)).toBe('6.0.0');
    });
  });

  describe('YarnVersionResolver', () => {
    beforeEach(() => {
      vi.mocked(arch).mockReturnValue('x64');
    });

    describe('partial versions', () => {
      test.each([
        {
          hostArch: 'x64',
          version: '1',
          pkg: 'yarn',
          versions: ['1.21.0', '1.22.22', '2.0.0'],
          expected: '1.22.22',
        },
        {
          hostArch: 'x64',
          version: '4.5',
          pkg: '@yarnpkg/cli-dist',
          versions: ['4.5.0', '4.5.3', '4.6.0'],
          expected: '4.5.3',
        },
        {
          hostArch: 'x64',
          version: '6',
          pkg: '@yarnpkg/yarn-x86_64-unknown-linux-musl',
          versions: ['6.0.0', '6.1.0', '7.0.0'],
          expected: '6.1.0',
        },
        {
          hostArch: 'arm64',
          version: '6',
          pkg: '@yarnpkg/yarn-aarch64-unknown-linux-musl',
          versions: ['6.0.0', '6.1.0', '7.0.0'],
          expected: '6.1.0',
        },
      ] as const)(
        'resolves $version on $hostArch from $pkg',
        async ({ hostArch, version, pkg, versions, expected }) => {
          vi.mocked(arch).mockReturnValue(hostArch);
          scope(registryUrl)
            .get(`/${pkg}`)
            .reply(200, {
              name: pkg,
              'dist-tags': { latest: expected },
              versions: Object.fromEntries(versions.map((v) => [v, {}])),
            });
          const { svc } = await toolContext(YarnVersionResolver);

          expect(await svc.resolve(version)).toBe(expected);
        },
      );

      test('throws if no release matches', async () => {
        scope(registryUrl)
          .get('/@yarnpkg/cli-dist')
          .reply(200, {
            name: '@yarnpkg/cli-dist',
            'dist-tags': { latest: '4.5.3' },
            versions: { '4.5.3': {} },
          });
        const { svc } = await toolContext(YarnVersionResolver);

        await expect(svc.resolve('4.9')).rejects.toThrow(
          'No yarn release found for version 4.9',
        );
      });
    });

    test('resolves latest', async () => {
      scope(registryUrl)
        .get('/@yarnpkg/cli-dist')
        .reply(200, {
          name: '@yarnpkg/cli-dist',
          'dist-tags': { latest: '4.5.3' },
        });
      const { svc } = await toolContext(YarnVersionResolver);

      expect(await svc.resolve('latest')).toBe('4.5.3');
    });

    test('keeps a pinned version', async () => {
      const { svc } = await toolContext(YarnVersionResolver);

      expect(await svc.resolve('4.5.3')).toBe('4.5.3');
    });
  });
});

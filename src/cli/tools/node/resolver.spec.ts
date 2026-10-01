import { injectFromHierarchy, injectable } from 'inversify';
import { describe, expect, test } from 'vitest';
import {
  NodeVersionResolver,
  NpmVersionResolver,
  YarnVersionResolver,
} from './resolver.ts';
import { scope } from '~test/http-mock.ts';
import { toolContext } from '~test/tool.ts';

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
  });

  describe('YarnVersionResolver', () => {
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

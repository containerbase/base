import { injectFromHierarchy, injectable } from 'inversify';
import { describe, expect, test } from 'vitest';
import { partialVersionHelp } from '../../install-tool/tool-version-resolver.ts';
import { ConanVersionResolver } from './conan.ts';
import {
  PipVersionResolver,
  createPipVersionResolver,
  normalizePythonDepName,
} from './pip.ts';
import { scope } from '~test/http-mock.ts';
import { toolContext } from '~test/tool.ts';

const baseUrl = 'https://pypi.org';

@injectable()
@injectFromHierarchy()
class PipToolsVersionResolver extends PipVersionResolver {
  readonly tool = 'pip_tools';
}

describe('cli/tools/python/pip', () => {
  test('normalizePythonDepName', () => {
    expect(normalizePythonDepName('pip_tools')).toBe('pip-tools');
    expect(normalizePythonDepName('Zope.Interface')).toBe('zope-interface');
    expect(normalizePythonDepName('poetry')).toBe('poetry');
  });

  test.each([{ version: undefined }, { version: 'latest' }])(
    'resolves $version',
    async ({ version }) => {
      scope(baseUrl)
        .get('/pypi/pip-tools/json')
        .reply(200, { info: { version: '7.4.1' }, releases: {} });
      const { svc } = await toolContext(PipToolsVersionResolver);

      expect(await svc.resolve(version)).toBe('7.4.1');
    },
  );

  test('keeps a pinned version', async () => {
    const { svc } = await toolContext(PipToolsVersionResolver);

    expect(await svc.resolve('7.4.1')).toBe('7.4.1');
  });

  describe('partial versions', () => {
    const file = { packagetype: 'sdist', yanked: false };
    const pipMeta = {
      info: { version: '24.0' },
      releases: {
        '21.2.4': [file],
        '21.3': [file],
        '21.3.1': [file],
        '21.3.2': [{ ...file, yanked: true }],
        '21.3.3': [],
        '21.4.0rc1': [file],
        '21.4.0.dev1': [file],
        '22.0': [file],
        '22.0.1': [file],
        '22.1.0b1': [file],
        '210.0': [file],
        'not-a-version': [file],
        '24.0': [file],
      },
    };

    test.each([
      { version: '21', expected: '21.3.1' },
      { version: '21.2', expected: '21.2.4' },
      { version: '22', expected: '22.0.1' },
      { version: '210', expected: '210.0' },
    ])('resolves $version to $expected', async ({ version, expected }) => {
      scope(baseUrl).get('/pypi/pip-tools/json').reply(200, pipMeta);
      const { svc } = await toolContext(PipToolsVersionResolver);

      expect(await svc.resolve(version)).toBe(expected);
    });

    test.each(['21.3', '22.0', '24.0'])(
      'keeps %s as it is an existing release',
      async (version) => {
        scope(baseUrl).get('/pypi/pip-tools/json').reply(200, pipMeta);
        const { svc } = await toolContext(PipToolsVersionResolver);

        expect(await svc.resolve(version)).toBe(version);
      },
    );

    test.each(['21.4', '23', '22.1'])(
      'throws for %s without a matching release',
      async (version) => {
        scope(baseUrl).get('/pypi/pip-tools/json').reply(200, pipMeta);
        const { svc } = await toolContext(PipToolsVersionResolver);

        await expect(svc.resolve(version)).rejects.toThrow(
          `No pip_tools release found for version ${version}`,
        );
      },
    );

    test('keeps the version when pypi has no such package', async () => {
      scope(baseUrl).get('/pypi/pip-tools/json').reply(404);
      const { svc } = await toolContext(PipToolsVersionResolver);

      // eg. a package from a private index, pip resolves it
      expect(await svc.resolve('1.2')).toBe('1.2');
    });

    test('keeps the version when pypi is not reachable', async () => {
      scope(baseUrl)
        .get('/pypi/pip-tools/json')
        .times(3)
        .replyWithError('connection reset');
      const { svc } = await toolContext(PipToolsVersionResolver);

      expect(await svc.resolve('1.2')).toBe('1.2');
    });

    test('resolves a conan version', async () => {
      scope(baseUrl)
        .get('/pypi/conan/json')
        .reply(200, {
          info: { version: '2.9.0' },
          releases: { '1.66.0': [file], '2.8.1': [file], '2.9.0': [file] },
        });
      const { svc } = await toolContext(ConanVersionResolver);

      expect(await svc.resolve('2')).toBe('2.9.0');
    });
  });

  test('createPipVersionResolver', async () => {
    scope(baseUrl)
      .get('/pypi/checkov/json')
      .reply(200, { info: { version: '3.2.1' }, releases: {} });
    const { svc } = await toolContext(createPipVersionResolver('checkov'));

    expect(svc.tool).toBe('checkov');
    expect(svc.versionHelp).toBe(partialVersionHelp);
    expect(await svc.resolve('latest')).toBe('3.2.1');
  });
});

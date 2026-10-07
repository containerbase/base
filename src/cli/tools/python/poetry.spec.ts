import { describe, expect, test } from 'vitest';
import { PoetryVersionResolver } from './poetry.ts';
import { scope } from '~test/http-mock.ts';
import { toolContext } from '~test/tool.ts';

const baseUrl = 'https://pypi.org';

const mirrorMeta = {
  info: {
    version: '0.6.1',
    // the second entry cannot be parsed and is skipped
    requires_dist: ['poetry>=1.2.1,<2.0.0', '3invalid'],
  },
  releases: {},
};

const poetryMeta = {
  info: { version: '2.0.0' },
  releases: {
    '1.8.3': [{ packagetype: 'sdist', yanked: false }],
    '1.8.4': [{ packagetype: 'sdist', yanked: true }],
    // a release without files is skipped
    '1.8.5': [],
    '2.0.0': [{ packagetype: 'sdist', yanked: false }],
  },
};

describe('cli/tools/python/poetry', () => {
  test.each([{ version: undefined }, { version: 'latest' }])(
    'resolves $version to the newest version the mirror plugin supports',
    async ({ version }) => {
      scope(baseUrl)
        .get('/pypi/poetry-plugin-pypi-mirror/json')
        .reply(200, mirrorMeta)
        .get('/pypi/poetry/json')
        .reply(200, poetryMeta);
      const { svc } = await toolContext(PoetryVersionResolver);

      expect(await svc.resolve(version)).toBe('1.8.3');
    },
  );

  test('falls back to the latest version', async () => {
    scope(baseUrl)
      .get('/pypi/poetry-plugin-pypi-mirror/json')
      .reply(200, mirrorMeta)
      .get('/pypi/poetry/json')
      .reply(200, { info: { version: '2.0.0' }, releases: {} });
    const { svc } = await toolContext(PoetryVersionResolver);

    expect(await svc.resolve('latest')).toBe('2.0.0');
  });

  test('throws without a poetry constraint', async () => {
    scope(baseUrl)
      .get('/pypi/poetry-plugin-pypi-mirror/json')
      .reply(200, { info: { version: '0.6.1' }, releases: {} });
    const { svc } = await toolContext(PoetryVersionResolver);

    await expect(svc.resolve('latest')).rejects.toThrow(
      'poetry-plugin-pypi-mirror has missing poetry version',
    );
  });

  test.each([
    { version: '2', expected: '2.0.0' },
    { version: '1.8', expected: '1.8.3' },
  ])(
    'resolves $version without the mirror plugin limit',
    async ({ version, expected }) => {
      scope(baseUrl)
        .get('/pypi/poetry/json')
        .reply(200, {
          info: poetryMeta.info,
          releases: {
            ...poetryMeta.releases,
            '2.1.0rc1': [{ packagetype: 'sdist', yanked: false }],
          },
        });
      const { svc } = await toolContext(PoetryVersionResolver);

      expect(await svc.resolve(version)).toBe(expected);
    },
  );

  test('keeps a partial version which is an existing release', async () => {
    scope(baseUrl)
      .get('/pypi/poetry/json')
      .reply(200, {
        info: poetryMeta.info,
        releases: {
          ...poetryMeta.releases,
          '1.9': [{ packagetype: 'sdist', yanked: false }],
          '1.9.1': [{ packagetype: 'sdist', yanked: false }],
        },
      });
    const { svc } = await toolContext(PoetryVersionResolver);

    expect(await svc.resolve('1.9')).toBe('1.9');
  });

  test('throws for a partial version without a matching release', async () => {
    scope(baseUrl).get('/pypi/poetry/json').reply(200, poetryMeta);
    const { svc } = await toolContext(PoetryVersionResolver);

    await expect(svc.resolve('3')).rejects.toThrow(
      'No poetry release found for version 3',
    );
  });

  test('keeps a pinned version', async () => {
    const { svc } = await toolContext(PoetryVersionResolver);

    expect(await svc.resolve('1.8.3')).toBe('1.8.3');
  });
});

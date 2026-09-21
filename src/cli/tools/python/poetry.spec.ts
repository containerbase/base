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

  test('keeps a pinned version', async () => {
    const { svc } = await toolContext(PoetryVersionResolver);

    expect(await svc.resolve('1.8.3')).toBe('1.8.3');
  });
});

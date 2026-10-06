import { arch } from 'node:os';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  JavaJdkVersionResolver,
  JavaJreVersionResolver,
  JavaVersionResolver,
} from './resolver.ts';
import { scope } from '~test/http-mock.ts';
import { toolContext } from '~test/tool.ts';

vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:os')>()),
  arch: vi.fn(() => 'x64'),
}));

const baseUrl = 'https://api.adoptium.net';

describe('cli/tools/java/resolver', () => {
  beforeEach(() => {
    vi.mocked(arch).mockReturnValue('x64');
  });

  test.each([
    { tool: 'java', resolver: JavaVersionResolver, imageType: 'jdk' },
    { tool: 'java-jdk', resolver: JavaJdkVersionResolver, imageType: 'jdk' },
    { tool: 'java-jre', resolver: JavaJreVersionResolver, imageType: 'jre' },
  ])('$tool resolves the latest lts', async ({ resolver, imageType }) => {
    scope(baseUrl)
      .get('/v3/info/release_versions')
      .query((q) => q.image_type === imageType)
      .reply(200, { versions: [{ semver: '21.0.4+7' }] });
    const { svc } = await toolContext(resolver);

    expect(await svc.resolve('latest')).toBe('21.0.4+7');
  });

  test.each([
    { version: '11', range: '[11,12)' },
    { version: '11.0', range: '[11.0,11.1)' },
    { version: '11.0.24', range: '[11.0.24,11.0.25)' },
    { version: '22', range: '[22,23)' },
  ])('resolves the partial version $version', async ({ version, range }) => {
    scope(baseUrl)
      .get('/v3/info/release_versions')
      .query(
        (q) =>
          q.version === range &&
          q.image_type === 'jdk' &&
          q.sort_order === 'DESC' &&
          !('lts' in q) &&
          !('semver' in q),
      )
      .reply(200, { versions: [{ semver: '11.0.32+101' }] });
    const { svc } = await toolContext(JavaVersionResolver);

    expect(await svc.resolve(version)).toBe('11.0.32+101');
  });

  test('resolves a partial version for the jre', async () => {
    scope(baseUrl)
      .get('/v3/info/release_versions')
      .query((q) => q.version === '[21,22)' && q.image_type === 'jre')
      .reply(200, { versions: [{ semver: '21.0.4+7' }] });
    const { svc } = await toolContext(JavaJreVersionResolver);

    expect(await svc.resolve('21')).toBe('21.0.4+7');
  });

  test('returns undefined when no version matches', async () => {
    scope(baseUrl)
      .get('/v3/info/release_versions')
      .query((q) => q.version === '[99,100)')
      .reply(200, { versions: [] });
    const { svc } = await toolContext(JavaVersionResolver);

    expect(await svc.resolve('99')).toBeUndefined();
  });

  test.each(['17.0.12+7', '21.0.1+12.0.LTS'])(
    'keeps the pinned version %s',
    async (version) => {
      const { svc } = await toolContext(JavaVersionResolver);

      expect(await svc.resolve(version)).toBe(version);
    },
  );
});

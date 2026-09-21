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

  test('keeps a pinned version', async () => {
    const { svc } = await toolContext(JavaVersionResolver);

    expect(await svc.resolve('17.0.12+7')).toBe('17.0.12+7');
  });
});

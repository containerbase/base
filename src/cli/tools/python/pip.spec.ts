import { injectFromHierarchy, injectable } from 'inversify';
import { describe, expect, test } from 'vitest';
import { PipVersionResolver, normalizePythonDepName } from './pip.ts';
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
});

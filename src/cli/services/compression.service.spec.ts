import { execa } from 'execa';
import type { Container } from 'inversify';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { CompressionService } from './index.ts';
import { testContainer } from '~test/di.ts';

vi.mock('execa');

describe('cli/services/compression.service', () => {
  let child!: Container;

  beforeEach(async () => {
    child = await testContainer();
  });

  test('extracts with bstar', async () => {
    const svc = await child.getAsync(CompressionService);

    await expect(
      svc.extract({ file: 'some.txz', cwd: globalThis.cacheDir }),
    ).resolves.toBeUndefined();

    await expect(
      svc.extract({ file: 'some.txz', cwd: globalThis.cacheDir, strip: 1 }),
    ).resolves.toBeUndefined();
  });

  test('extracts with a utf-8 locale', async () => {
    const svc = await child.getAsync(CompressionService);

    await svc.extract({ file: 'some.txz', cwd: globalThis.cacheDir });

    expect(execa).toHaveBeenCalledWith(
      'bsdtar',
      expect.arrayContaining(['-xf', 'some.txz']),
      { env: { LC_ALL: 'C.UTF-8', LANG: 'C.UTF-8' } },
    );
  });
});

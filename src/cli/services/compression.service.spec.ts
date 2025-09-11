import type { Container } from 'inversify';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { CompressionService } from '.';
import { testContainer } from '~test/path';

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
});

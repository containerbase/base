import type { Container } from 'inversify';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { CompressionService, createContainer } from '.';

vi.mock('execa');

describe('cli/services/compression.service', () => {
  let child!: Container;

  beforeEach(() => {
    child = createContainer();
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

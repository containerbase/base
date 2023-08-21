import type { Container } from 'inversify';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { CompressionService, rootContainer } from '.';

vi.mock('execa');
vi.mock('node:fs');
vi.mock('node:stream/promises');

describe('compression.service', () => {
  let child!: Container;

  beforeEach(() => {
    child = rootContainer.createChild();
  });

  test('extracts with bstar', async () => {
    const svc = child.get(CompressionService);

    await expect(
      svc.extract({ file: 'some.txz', cwd: globalThis.cacheDir }),
    ).resolves.toBeUndefined();

    await expect(
      svc.extract({ file: 'some.txz', cwd: globalThis.cacheDir, strip: 1 }),
    ).resolves.toBeUndefined();
  });

  test('extracts with node-tar', async () => {
    const svc = child.get(CompressionService);

    await expect(
      svc.extract({ file: 'some.tgz', cwd: globalThis.cacheDir }),
    ).resolves.toBeUndefined();
  });
});

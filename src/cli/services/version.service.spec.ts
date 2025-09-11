import { mkdir } from 'fs/promises';
import { Container } from 'inversify';
import { beforeEach, describe, expect, test } from 'vitest';
import { VersionService } from '.';
import { testContainer } from '~test/di';
import { rootPath } from '~test/path';

describe('cli/services/version.service', () => {
  let child!: Container;
  let svc!: VersionService;

  beforeEach(async () => {
    child = await testContainer();
    svc = await child.getAsync(VersionService);
  });

  test('works', async () => {
    // doesn't fail
    await svc.update('node', '14.17.0');

    await mkdir(rootPath('opt/containerbase/versions'), { recursive: true });

    expect(await svc.find('node')).toBeNull();
    await svc.update('node', '14.17.0');
    expect(await svc.find('node')).toBe('14.17.0');
    await svc.update('node', '');
    expect(await svc.find('node')).toBeNull();
  });
});

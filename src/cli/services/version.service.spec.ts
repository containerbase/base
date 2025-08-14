import { mkdir } from 'fs/promises';
import { Container } from 'inversify';
import { beforeEach, describe, expect, test } from 'vitest';
import { VersionService, createContainer } from '.';
import { rootPath } from '~test/path';

describe('cli/services/version.service', () => {
  let child!: Container;

  beforeEach(() => {
    child = createContainer();
  });

  test('works', async () => {
    const svc = child.get(VersionService);

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

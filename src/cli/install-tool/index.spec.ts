import { beforeAll, describe, expect, test, vi } from 'vitest';
import { VersionService, createContainer } from '../services';
import { NpmVersionResolver } from '../tools/node/resolver';
import { NpmBaseInstallService } from '../tools/node/utils';
import { PipVersionResolver } from '../tools/python/pip';
import { PipBaseInstallService } from '../tools/python/utils';
import {
  RubyBaseInstallService,
  RubyGemVersionResolver,
} from '../tools/ruby/utils';
import { installTool, resolveVersion } from '.';
import { ensurePaths } from '~test/path';

vi.mock('del');
vi.mock('execa');
vi.mock('../tools/bun');
vi.mock('../tools/php/composer');

describe('cli/install-tool/index', () => {
  beforeAll(async () => {
    await ensurePaths([
      'var/lib/containerbase/tool.prep.d',
      'tmp/containerbase/tool.init.d',
      'opt/containerbase/data',
    ]);

    const verSvc = await createContainer().getAsync(VersionService);

    await verSvc.setCurrent({
      name: 'node',
      tool: { name: 'node', version: '1.0.0' },
    });
    await verSvc.setCurrent({
      name: 'python',
      tool: { name: 'python', version: '1.0.0' },
    });
    await verSvc.setCurrent({
      name: 'ruby',
      tool: { name: 'ruby', version: '1.0.0' },
    });
  });

  describe('installTool', () => {
    test('works', async () => {
      expect(await installTool('bun', '1.0.0')).toBeUndefined();
      expect(await installTool('dummy', '1.0.0')).toBeUndefined();
    });

    test.each([
      {
        type: 'gem' as const,
        svc: RubyBaseInstallService,
      },
      {
        type: 'npm' as const,
        svc: NpmBaseInstallService,
      },
      {
        type: 'pip' as const,
        svc: PipBaseInstallService,
      },
    ])('works: $type', async ({ type, svc }) => {
      vi.spyOn(svc.prototype, 'install').mockResolvedValue();
      vi.spyOn(svc.prototype, 'needsInitialize').mockReturnValue(false);
      vi.spyOn(svc.prototype, 'validate').mockResolvedValue(true);
      vi.spyOn(svc.prototype, 'postInstall').mockResolvedValue();
      vi.spyOn(svc.prototype, 'test').mockRejectedValue(new Error('test'));
      expect(
        await installTool(`dummy-${type}`, '1.0.0', false, type),
      ).toBeUndefined();
    });
  });

  describe('resolveVersion', () => {
    test('works', async () => {
      expect(await resolveVersion('composer', '1.0.0')).toBe('1.0.0');
    });

    test.each([
      {
        type: 'gem' as const,
        svc: RubyGemVersionResolver,
      },
      {
        type: 'npm' as const,
        svc: NpmVersionResolver,
      },
      {
        type: 'pip' as const,
        svc: PipVersionResolver,
      },
    ])('works: $type', async ({ type, svc }) => {
      vi.spyOn(svc.prototype, 'resolve').mockResolvedValue('1.0.0');
      expect(await resolveVersion('dummy', '1.0.0', type)).toBe('1.0.0');
    });
  });
});

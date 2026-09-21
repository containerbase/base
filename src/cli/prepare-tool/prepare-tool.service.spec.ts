import fs from 'node:fs/promises';
import { type Container, injectFromHierarchy, injectable } from 'inversify';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { PathService } from '../services/index.ts';
import { logger } from '../utils/index.ts';
import { BasePrepareService } from './base-prepare.service.ts';
import { V2ToolPrepareService } from './prepare-legacy-tools.service.ts';
import {
  PREPARE_TOOL_TOKEN,
  PrepareToolService,
} from './prepare-tool.service.ts';
import { testContainer } from '~test/di.ts';
import { ensurePaths, rootPath } from '~test/path.ts';

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock('execa', () => ({ execa: execaMock }));
vi.mock('del');

vi.mock('node:process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:process')>()),
  geteuid: vi.fn(() => 0),
}));

@injectable()
@injectFromHierarchy()
class DummyPrepareService extends BasePrepareService {
  readonly name: string = 'dummy';

  override prepare(): Promise<void> {
    return Promise.resolve();
  }

  override initialize(): Promise<void> {
    return Promise.resolve();
  }

  run(command: string, args: string[]): Promise<unknown> {
    return this._spawn(command, args);
  }
}

/** `bun` is listed in both `NoPrepareTools` and `NoInitTools`. */
@injectable()
@injectFromHierarchy()
class BunPrepareService extends BasePrepareService {
  readonly name = 'bun';
}

@injectable()
@injectFromHierarchy()
class IgnoredPrepareService extends DummyPrepareService {
  override readonly name = 'ignored';
}

@injectable()
@injectFromHierarchy()
class LegacyPrepareService extends V2ToolPrepareService {
  readonly name = 'legacy';
}

describe('cli/prepare-tool/prepare-tool.service', () => {
  let child!: Container;
  let pathSvc!: PathService;
  let svc!: PrepareToolService;

  beforeAll(async () => {
    await ensurePaths([
      'opt/containerbase/tools',
      'tmp/containerbase/tool.init.d',
      'usr/local/containerbase/tools/v2',
      'var/lib/containerbase/tool.prep.d',
    ]);
    await fs.writeFile(
      rootPath('usr/local/containerbase/tools/v2/legacy.sh'),
      '\nfunction prepare_tool () {\n:\n}\nfunction init_tool () {\n:\n}\n',
    );
  });

  beforeEach(async () => {
    vi.stubEnv('IGNORED_TOOLS', 'ignored');
    child = await testContainer();
    child.bind(PrepareToolService).toSelf();
    child.bind(PREPARE_TOOL_TOKEN).to(DummyPrepareService);
    child.bind(PREPARE_TOOL_TOKEN).to(BunPrepareService);
    child.bind(PREPARE_TOOL_TOKEN).to(IgnoredPrepareService);
    child.bind(PREPARE_TOOL_TOKEN).to(LegacyPrepareService);
    child.bind(DummyPrepareService).toSelf();
    child.bind(BunPrepareService).toSelf();
    pathSvc = await child.getAsync(PathService);
    svc = await child.getAsync(PrepareToolService);
    execaMock.mockResolvedValue({ failed: false });
  });

  describe('prepare', () => {
    test('dry run', async () => {
      expect(await svc.prepare(['dummy'], true)).toBeUndefined();

      expect(logger.info).toHaveBeenCalledWith(
        'Dry run: preparing tools dummy ...',
      );
    });

    test('fails when not root', async () => {
      const { geteuid } = await import('node:process');
      vi.mocked(geteuid!).mockReturnValue(1000);
      // the env service reads the user id when it is constructed
      const nonRoot = await testContainer();
      nonRoot.bind(PrepareToolService).toSelf();
      const nonRootSvc = await nonRoot.getAsync(PrepareToolService);

      expect(await nonRootSvc.prepare(['dummy'])).toBe(1);

      expect(logger.fatal).toHaveBeenCalledExactlyOnceWith(
        'prepare tools must be run as root',
      );
    });

    test('fails for an unknown tool', async () => {
      expect(await svc.prepare(['not-exist'])).toBe(1);

      expect(logger.error).toHaveBeenCalledExactlyOnceWith(
        { tool: 'not-exist' },
        'tool not found',
      );
    });

    test('skips tools which never need preparation', async () => {
      const spy = vi.spyOn(DummyPrepareService.prototype, 'prepare');

      expect(await svc.prepare(['bun'])).toBeUndefined();

      expect(spy).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        { tool: 'bun' },
        'tool does not need to be prepared (no service)',
      );
    });

    test('prepares a tool', async () => {
      const spy = vi.spyOn(DummyPrepareService.prototype, 'prepare');

      expect(await svc.prepare(['dummy'])).toBeUndefined();

      expect(spy).toHaveBeenCalledOnce();
      expect(await pathSvc.isPrepared('dummy')).toBe(true);

      // a second run is skipped
      spy.mockClear();
      expect(await svc.prepare(['dummy'])).toBeUndefined();
      expect(spy).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        { tool: 'dummy' },
        'tool already prepared',
      );
    });

    test('skips ignored tools', async () => {
      const spy = vi.spyOn(IgnoredPrepareService.prototype, 'prepare');

      expect(await svc.prepare(['ignored'])).toBeUndefined();

      expect(spy).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        { tool: 'ignored' },
        'tool ignored',
      );
    });

    test('prepares all tools', async () => {
      const spy = vi.spyOn(LegacyPrepareService.prototype, 'prepare');

      expect(await svc.prepare(['all'])).toBeUndefined();

      expect(spy).toHaveBeenCalledOnce();
      expect(execaMock).toHaveBeenCalledWith(
        'bash',
        [
          '/usr/local/containerbase/bin/v2-install-tool.sh',
          'prepare',
          'legacy',
        ],
        expect.any(Object),
      );
    });
  });

  describe('initialize', () => {
    test('dry run', async () => {
      expect(await svc.initialize(['dummy'], true)).toBeUndefined();

      expect(logger.info).toHaveBeenCalledWith(
        'Dry run: initializing tools dummy ...',
      );
    });

    test('ignores unknown tools', async () => {
      expect(await svc.initialize(['not-exist'])).toBeUndefined();
    });

    test('skips tools which never need initialization', async () => {
      expect(await svc.initialize(['bun'])).toBeUndefined();

      expect(logger.debug).toHaveBeenCalledWith(
        { tool: 'bun' },
        'tool does not need to be initialized',
      );
    });

    test('initializes a tool', async () => {
      const spy = vi.spyOn(DummyPrepareService.prototype, 'initialize');

      expect(await svc.initialize(['dummy'])).toBeUndefined();

      expect(spy).toHaveBeenCalledOnce();
      expect(await pathSvc.isInitialized('dummy')).toBe(true);

      // a second run is skipped
      spy.mockClear();
      expect(await svc.initialize(['dummy'])).toBeUndefined();
      expect(spy).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        { tool: 'dummy' },
        'tool already initialized',
      );
    });

    test('skips ignored tools', async () => {
      const spy = vi.spyOn(IgnoredPrepareService.prototype, 'initialize');

      expect(await svc.initialize(['ignored'])).toBeUndefined();

      expect(spy).not.toHaveBeenCalled();
    });

    test('initializes all prepared tools', async () => {
      const spy = vi.spyOn(LegacyPrepareService.prototype, 'initialize');
      await pathSvc.setPrepared('legacy');

      expect(await svc.initialize(['all'])).toBeUndefined();

      expect(spy).toHaveBeenCalledOnce();
      expect(execaMock).toHaveBeenCalledWith(
        'bash',
        ['/usr/local/containerbase/bin/v2-install-tool.sh', 'init', 'legacy'],
        expect.any(Object),
      );
    });
  });

  describe('BasePrepareService', () => {
    test('defaults', async () => {
      const bun = await child.getAsync(BunPrepareService);

      expect(bun.toString()).toBe('bun');
      expect(bun.needsInitialize()).toBe(false);
      expect(bun.needsPrepare()).toBe(false);
      expect(bun.prepare()).toBeUndefined();
      expect(bun.initialize()).toBeUndefined();
    });

    test('_spawn runs in the temp dir', async () => {
      const dummy = await child.getAsync(DummyPrepareService);

      await expect(dummy.run('dummy', ['--version'])).resolves.toBeDefined();

      expect(execaMock).toHaveBeenCalledWith(
        'dummy',
        ['--version'],
        expect.objectContaining({ cwd: rootPath('tmp') }),
      );
    });
  });
});

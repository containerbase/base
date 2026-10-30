import { injectFromHierarchy, injectable } from 'inversify';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { BaseInstallService } from '../install-tool/base-install.service.ts';
import { V1ToolInstallService } from '../install-tool/install-legacy-tool.service.ts';
import {
  INSTALL_TOOL_TOKEN,
  InstallToolService,
} from '../install-tool/install-tool.service.ts';
import {
  DataService,
  EnvService,
  VersionService,
  createContainer,
} from '../services/index.ts';
import type { ToolVersion } from '../services/version.service.ts';
import { logger } from '../utils/index.ts';
import { CleanupToolService } from './cleanup-tool.service.ts';
import { ensurePaths } from '~test/path.ts';

@injectable()
@injectFromHierarchy()
abstract class TestInstallService extends BaseInstallService {
  /** Does nothing, for tests. */
  override install(_version: string): Promise<void> {
    return Promise.resolve();
  }

  /** Does nothing, for tests. */
  override link(_version: string): Promise<void> {
    return Promise.resolve();
  }
}

/** a test tool */
@injectable()
@injectFromHierarchy()
class ParentInstallService extends TestInstallService {
  override readonly name = 'parent';
}

/** another test tool */
@injectable()
@injectFromHierarchy()
class ChildInstallService extends TestInstallService {
  override readonly name = 'child';
}

/** a third test tool */
@injectable()
@injectFromHierarchy()
class PlainInstallService extends TestInstallService {
  override readonly name = 'plain';
}

/** a tool linked under another name, like `java-jdk` as `java` */
@injectable()
@injectFromHierarchy()
class AliasedInstallService extends TestInstallService {
  override readonly name = 'aliased';

  /** Linked as `alias`. */
  override get alias(): string {
    return 'alias';
  }
}

/** a tool which can only be uninstalled as root, like `git` */
@injectable()
@injectFromHierarchy()
class RootOnlyInstallService extends TestInstallService {
  override readonly name = 'root-only';

  override readonly needsRoot = true;
}

/** a tool which is installed system wide, like `git` */
@injectable()
@injectFromHierarchy()
class NoUninstallInstallService extends TestInstallService {
  override readonly name = 'no-uninstall';

  override readonly canUninstall = false;
}

describe('cli/cleanup/cleanup-tool.service', () => {
  let svc: CleanupToolService;
  let ver: VersionService;

  beforeAll(async () => {
    await ensurePaths(['opt/containerbase/data', 'var/lib/containerbase']);
  });

  beforeEach(async () => {
    const container = createContainer();
    container.bind(CleanupToolService).toSelf();
    container.bind(InstallToolService).toSelf();
    container.bind(V1ToolInstallService).toSelf();
    container.bind(INSTALL_TOOL_TOKEN).to(ParentInstallService);
    container.bind(INSTALL_TOOL_TOKEN).to(ChildInstallService);
    container.bind(INSTALL_TOOL_TOKEN).to(PlainInstallService);
    container.bind(INSTALL_TOOL_TOKEN).to(AliasedInstallService);
    container.bind(INSTALL_TOOL_TOKEN).to(RootOnlyInstallService);
    container.bind(INSTALL_TOOL_TOKEN).to(NoUninstallInstallService);
    svc = await container.getAsync(CleanupToolService);
    ver = await container.getAsync(VersionService);
    // every test starts without installed or linked tools
    await ver.removeInstalled({});
    const db = await (await container.getAsync(DataService)).db();
    db.exec('DELETE FROM main.state');
  });

  /** Records an installed version. */
  async function add(
    name: string,
    version: string,
    parent?: ToolVersion['parent'],
  ): Promise<void> {
    await ver.addInstalled({ name, version, ...(parent && { parent }) });
  }

  /** Makes a version the linked one, under the alias when given. */
  async function link(
    name: string,
    version: string,
    alias = name,
  ): Promise<void> {
    await ver.setCurrent({ name: alias, tool: { name, version } });
  }

  /** The installed versions of a tool. */
  async function installed(name: string): Promise<string[]> {
    return (await ver.findInstalled(name)).map((v) => v.version).sort();
  }

  test('removes unlinked versions with their childs', async () => {
    await add('parent', '1.0.0');
    await link('parent', '1.0.0');
    await add('parent', '2.0.0');
    await add('plain', '1.0.0', { name: 'parent', version: '2.0.0' });
    await add('child', '1.0.0', { name: 'parent', version: '2.0.0' });
    // a child installed for two versions, which are both removed
    await add('plain', '1.0.0', { name: 'child', version: '1.0.0' });

    expect(await svc.cleanupTools()).toBeUndefined();

    expect(await installed('parent')).toEqual(['1.0.0']);
    expect(await installed('plain')).toEqual([]);
    expect(await installed('child')).toEqual([]);
    expect(logger.info).toHaveBeenCalledWith(
      'Uninstalling unlinked tool parent@2.0.0...',
    );
    // already removed as a child of `parent@2.0.0`
    expect(logger.info).not.toHaveBeenCalledWith(
      'Uninstalling unlinked tool plain@1.0.0...',
    );
  });

  test('keeps versions with a linked child', async () => {
    await add('parent', '1.0.0');
    await link('parent', '1.0.0');
    await add('parent', '0.9.0');
    await add('plain', '2.0.0', { name: 'parent', version: '1.0.0' });
    await link('plain', '2.0.0');
    await add('plain', '1.0.0', { name: 'parent', version: '0.9.0' });
    await add('plain', '1.5.0', { name: 'parent', version: '0.9.0' });
    // the linked grand child keeps both versions above it
    await add('child', '3.0.0', { name: 'plain', version: '1.0.0' });
    await link('child', '3.0.0');

    expect(await svc.cleanupTools()).toBeUndefined();

    expect(await installed('parent')).toEqual(['0.9.0', '1.0.0']);
    // the unlinked child of a kept version is kept as well
    expect(await installed('plain')).toEqual(['1.0.0', '1.5.0', '2.0.0']);
    expect(await installed('child')).toEqual(['3.0.0']);
    expect(logger.info).toHaveBeenCalledWith(
      { tool: 'parent', version: '0.9.0' },
      'keeping unlinked tool version, a child tool version is linked',
    );
    expect(logger.info).toHaveBeenCalledWith(
      { tool: 'plain', version: '1.0.0' },
      'keeping unlinked tool version, a child tool version is linked',
    );
  });

  test('keeps versions with a kept child', async () => {
    await add('parent', '1.0.0');
    await link('parent', '1.0.0');
    await add('parent', '0.8.0');
    await add('root-only', '1.0.0', { name: 'parent', version: '0.8.0' });
    await add('plain', '3.0.0', { name: 'parent', version: '0.8.0' });
    await add('child', '9.0.0');
    await link('child', '9.0.0');
    await add('child', '0.5.0');
    // uninstalling `child@0.5.0` would remove it for `parent@0.8.0` too
    await add('plain', '3.0.0', { name: 'child', version: '0.5.0' });

    expect(await svc.cleanupTools()).toBeUndefined();

    expect(await installed('parent')).toEqual(['0.8.0', '1.0.0']);
    expect(await installed('plain')).toEqual(['3.0.0', '3.0.0']);
    expect(await installed('child')).toEqual(['0.5.0', '9.0.0']);
    expect(logger.info).toHaveBeenCalledWith(
      { tool: 'parent', version: '0.8.0' },
      'keeping unlinked tool version, it or a child tool cannot be uninstalled',
    );
    expect(logger.info).toHaveBeenCalledWith(
      { tool: 'child', version: '0.5.0' },
      'keeping unlinked tool version, a child tool version is kept',
    );
  });

  test('looks the linked version up by the tool name', async () => {
    await add('aliased', '1.0.0');
    await add('aliased', '2.0.0');
    await link('aliased', '2.0.0', 'alias');

    expect(await svc.cleanupTools()).toBeUndefined();

    expect(await installed('aliased')).toEqual(['2.0.0']);
  });

  test('skips tools which cannot be uninstalled', async () => {
    await add('legacy', '1.0.0');
    await add('no-uninstall', '1.0.0');
    await add('root-only', '2.0.0');

    expect(await svc.cleanupTools()).toBeUndefined();

    expect(await installed('legacy')).toEqual(['1.0.0']);
    expect(await installed('no-uninstall')).toEqual(['1.0.0']);
    expect(await installed('root-only')).toEqual(['2.0.0']);
    expect(logger.fatal).not.toHaveBeenCalled();

    // root can uninstall root only tools
    vi.spyOn(EnvService.prototype, 'isRoot', 'get').mockReturnValue(true);
    expect(await svc.cleanupTools()).toBeUndefined();
    expect(await installed('root-only')).toEqual([]);
  });

  test('dry run', async () => {
    await add('parent', '1.0.0');
    await link('parent', '1.0.0');
    await add('parent', '2.0.0');

    expect(await svc.cleanupTools(true)).toBeUndefined();

    expect(await installed('parent')).toEqual(['1.0.0', '2.0.0']);
    expect(logger.info).toHaveBeenCalledWith(
      'Dry run: uninstall tool parent ...',
    );
  });

  test('continues after a failed uninstall and returns the first exit code', async () => {
    await add('parent', '1.0.0');
    await link('parent', '1.0.0');
    await add('parent', '2.0.0');
    await add('parent', '3.0.0');
    await add('plain', '1.0.0');
    vi.spyOn(InstallToolService.prototype, 'uninstall')
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3);

    expect(await svc.cleanupTools()).toBe(2);

    expect(await installed('parent')).toEqual(['1.0.0', '2.0.0', '3.0.0']);
    expect(await installed('plain')).toEqual([]);
    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
      { tools: ['parent@2.0.0', 'parent@3.0.0'] },
      'unlinked tool versions left installed',
    );
  });

  test('continues after an uninstall error and returns 1', async () => {
    await add('parent', '1.0.0');
    await link('parent', '1.0.0');
    await add('parent', '2.0.0');
    await add('plain', '1.0.0');
    const err = new Error('db failed');
    vi.spyOn(InstallToolService.prototype, 'uninstall').mockRejectedValueOnce(
      err,
    );

    expect(await svc.cleanupTools()).toBe(1);

    expect(await installed('parent')).toEqual(['1.0.0', '2.0.0']);
    expect(await installed('plain')).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith(
      { tool: 'parent', version: '2.0.0', err },
      'cannot uninstall unlinked tool version',
    );
    expect(logger.warn).toHaveBeenCalledWith(
      { tools: ['parent@2.0.0'] },
      'unlinked tool versions left installed',
    );
  });
});

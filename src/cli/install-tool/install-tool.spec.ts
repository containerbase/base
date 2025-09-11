import fs from 'node:fs/promises';
import type { Container } from 'inversify';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { VersionService, createContainer } from '../services';
import { BunInstallService } from '../tools/bun';
import { LegacyToolInstallService } from './install-legacy-tool.service';
import { INSTALL_TOOL_TOKEN, InstallToolService } from './install-tool.service';
import { rootPath } from '~test/path';

vi.mock('del');
vi.mock('execa');
vi.mock('../tools/bun');
vi.mock('../tools/php/composer');
vi.mock('../prepare-tool');

describe('cli/install-tool/install-tool', () => {
  const parent = createContainer();
  parent.bind(InstallToolService).toSelf();
  parent.bind(LegacyToolInstallService).toSelf();
  parent.bind(INSTALL_TOOL_TOKEN).to(BunInstallService);

  let child: Container;
  let install: InstallToolService;
  beforeAll(async () => {
    for (const p of [
      'var/lib/containerbase/tool.prep.d',
      'tmp/containerbase/tool.init.d',
    ]) {
      const prepDir = rootPath(p);
      await fs.mkdir(prepDir, {
        recursive: true,
      });
    }
  });

  beforeEach(async () => {
    child = createContainer(parent);
    install = await child.getAsync(InstallToolService);
  });

  test('writes version if tool is not installed', async () => {
    const ver = await child.getAsync(VersionService);
    const bun = await child.getAsync<BunInstallService>(INSTALL_TOOL_TOKEN);
    vi.mocked(bun).needsInitialize.mockResolvedValueOnce(true);
    vi.mocked(bun).needsPrepare.mockResolvedValueOnce(true);
    expect(await install.install('bun', '1.0.0')).toBeUndefined();
    expect(await ver.find('bun')).toBe('1.0.0');
  });

  test('writes version even if tool is installed', async () => {
    const ver = await child.getAsync(VersionService);
    const bun = await child.getAsync<BunInstallService>(INSTALL_TOOL_TOKEN);
    vi.mocked(bun).isInstalled.mockResolvedValueOnce(true);
    expect(await install.install('bun', '1.0.1')).toBeUndefined();
    expect(await ver.find('bun')).toBe('1.0.1');
  });
});

import fs from 'node:fs/promises';
import path from 'node:path';
import {
  type Container,
  type Newable,
  injectFromHierarchy,
  injectable,
} from 'inversify';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  LinkToolService,
  PathService,
  VersionService,
} from '../../services/index.ts';
import { logger } from '../../utils/index.ts';
import { PipBaseInstallService } from './utils.ts';
import { testContainer } from '~test/di.ts';
import { ensurePaths } from '~test/path.ts';

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock('execa', () => ({ execa: execaMock }));

const pythonVersion = '3.13.0';

@injectable()
@injectFromHierarchy()
class CopierInstallService extends PipBaseInstallService {
  readonly name = 'copier';
}

@injectable()
@injectFromHierarchy()
class HashinInstallService extends PipBaseInstallService {
  readonly name = 'hashin';
}

@injectable()
@injectFromHierarchy()
class PipToolsInstallService extends PipBaseInstallService {
  readonly name = 'pip-tools';
}

@injectable()
@injectFromHierarchy()
class PoetryInstallService extends PipBaseInstallService {
  readonly name = 'poetry';
}

describe('cli/tools/python/utils', () => {
  let child!: Container;
  let pathSvc!: PathService;

  /**
   * Create the `dist-info` directory pip would have created for an installed
   * package.
   */
  async function distInfo(
    tool: string,
    version: string,
    files: Record<string, string>,
  ): Promise<void> {
    const dir = path.join(
      pathSvc.versionedToolPath(tool, version),
      pythonVersion,
      'lib',
      'python3.13',
      'site-packages',
      `${tool.replaceAll(/[-_.]+/g, '_')}-${version}.dist-info`,
    );
    await fs.mkdir(dir, { recursive: true });
    for (const [name, content] of Object.entries(files)) {
      await fs.writeFile(path.join(dir, name), content);
    }
  }

  beforeAll(async () => {
    await ensurePaths([
      'tmp',
      'opt/containerbase/bin',
      'opt/containerbase/data',
      'opt/containerbase/versions',
    ]);

    const verSvc = await (await testContainer()).getAsync(VersionService);
    await verSvc.setCurrent({
      name: 'python',
      tool: { name: 'python', version: pythonVersion },
    });
  });

  beforeEach(async () => {
    child = await testContainer();
    child.bind(CopierInstallService).toSelf();
    child.bind(HashinInstallService).toSelf();
    child.bind(PipToolsInstallService).toSelf();
    child.bind(PoetryInstallService).toSelf();
    pathSvc = await child.getAsync(PathService);
    execaMock.mockResolvedValue({ failed: false, all: 'ok' });
  });

  test('install', async () => {
    const svc = await child.getAsync(HashinInstallService);

    await expect(svc.install('1.0.0')).resolves.toBeUndefined();

    const prefix = path.join(
      pathSvc.versionedToolPath('hashin', '1.0.0'),
      pythonVersion,
    );
    expect(execaMock).toHaveBeenCalledWith(
      'python',
      ['-m', 'virtualenv', '--no-periodic-update', prefix],
      expect.objectContaining({ cwd: pathSvc.installDir }),
    );
    expect(execaMock).toHaveBeenCalledWith(
      path.join(
        pathSvc.versionedToolPath('hashin', '1.0.0'),
        pythonVersion,
        'bin',
        'python',
      ),
      expect.arrayContaining(['hashin==1.0.0', 'setuptools']),
      expect.objectContaining({ cwd: pathSvc.installDir }),
    );
  });

  test('install: reuses an existing tool path', async () => {
    const svc = await child.getAsync(HashinInstallService);

    await pathSvc.createVersionedToolPath('hashin', '1.0.1');
    await expect(svc.install('1.0.1')).resolves.toBeUndefined();
  });

  test('install: throws when virtualenv fails', async () => {
    execaMock.mockResolvedValue({ failed: true, all: 'venv boom' });
    const svc = await child.getAsync(HashinInstallService);

    await expect(svc.install('2.0.0')).rejects.toThrow(
      'python virtualenv command failed',
    );
    expect(logger.warn).toHaveBeenCalledWith(
      'Python virtualenv error:\nvenv boom',
    );
  });

  test('install: throws when pip fails', async () => {
    execaMock.mockImplementation((cmd: string) =>
      Promise.resolve(
        cmd === 'python'
          ? { failed: false, all: 'ok' }
          : { failed: true, all: 'pip boom' },
      ),
    );
    const svc = await child.getAsync(HashinInstallService);

    await expect(svc.install('3.0.0')).rejects.toThrow(
      'pip install command failed',
    );
    expect(logger.warn).toHaveBeenCalledWith('Pip error:\npip boom');
    await expect(
      fs.stat(
        path.join(pathSvc.versionedToolPath('hashin', '3.0.0'), pythonVersion),
      ),
    ).rejects.toThrow();
  });

  test.each<{
    tool: string;
    svc: Newable<PipBaseInstallService>;
    version: string;
    expected: string[];
  }>([
    {
      tool: 'copier',
      svc: CopierInstallService,
      version: '9.0.0',
      expected: ['copier-templates-extensions'],
    },
    {
      tool: 'pip-tools',
      svc: PipToolsInstallService,
      version: '7.4.1',
      expected: ['keyrings.envvars>=1.1.0'],
    },
    {
      tool: 'poetry',
      svc: PoetryInstallService,
      version: '1.8.3',
      expected: ['poetry-plugin-pypi-mirror', 'virtualenv<21'],
    },
  ])(
    'install: extra args for $tool $version',
    async ({ svc, version, expected }) => {
      const install = await child.getAsync(svc);

      await expect(install.install(version)).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledWith(
        expect.stringContaining('bin/python'),
        expect.arrayContaining(expected),
        expect.any(Object),
      );
    },
  );

  test('install: poetry before v1.2.1 drops the mirror plugin', async () => {
    const svc = await child.getAsync(PoetryInstallService);

    await expect(svc.install('1.1.15')).resolves.toBeUndefined();

    expect(execaMock).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['poetry-plugin-pypi-mirror']),
      expect.any(Object),
    );
    expect(execaMock).toHaveBeenCalledWith(
      expect.stringContaining('bin/python'),
      expect.arrayContaining(['virtualenv<21']),
      expect.any(Object),
    );
  });

  test('install: pip-tools skips keyrings on python below 3.9', async () => {
    const verSvc = await child.getAsync(VersionService);
    await verSvc.setCurrent({
      name: 'python',
      tool: { name: 'python', version: '3.8.18' },
    });
    try {
      const svc = await child.getAsync(PipToolsInstallService);

      await expect(svc.install('6.14.0')).resolves.toBeUndefined();

      expect(execaMock).not.toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['keyrings.envvars>=1.1.0']),
        expect.any(Object),
      );
    } finally {
      await verSvc.setCurrent({
        name: 'python',
        tool: { name: 'python', version: pythonVersion },
      });
    }
  });

  test('install: poetry v2 drops the virtualenv pin', async () => {
    const svc = await child.getAsync(PoetryInstallService);

    await expect(svc.install('2.1.0')).resolves.toBeUndefined();

    expect(execaMock).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['virtualenv<21']),
      expect.any(Object),
    );
  });

  test('isInstalled', async () => {
    const svc = await child.getAsync(HashinInstallService);

    expect(await svc.isInstalled('4.0.0')).toBe(false);
    await distInfo('hashin', '4.0.0', { WHEEL: 'Wheel-Version: 1.0' });
    expect(await svc.isInstalled('4.0.0')).toBe(true);
  });

  test('link: console scripts', async () => {
    const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');
    const svc = await child.getAsync(PipToolsInstallService);
    await distInfo('pip-tools', '7.4.1', {
      'entry_points.txt':
        '[console_scripts]\npip-compile = piptools.scripts.compile:cli\npip-sync = piptools.scripts.sync:cli\n',
    });

    await expect(svc.link('7.4.1')).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenCalledWith('pip-tools', {
      srcDir: path.join(
        pathSvc.versionedToolPath('pip-tools', '7.4.1'),
        pythonVersion,
        'bin',
      ),
      name: 'pip-compile',
      extraToolEnvs: ['python'],
    });
  });

  test('link: falls back to the tool name', async () => {
    const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');
    const svc = await child.getAsync(HashinInstallService);

    await expect(svc.link('5.0.0')).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledExactlyOnceWith('hashin', {
      srcDir: expect.any(String),
      name: 'hashin',
      extraToolEnvs: ['python'],
    });
  });

  test('link: falls back when there are no console scripts', async () => {
    const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');
    const svc = await child.getAsync(HashinInstallService);
    await distInfo('hashin', '6.0.0', {
      'entry_points.txt': '[gui_scripts]\nhashin-gui = hashin:gui\n',
    });

    await expect(svc.link('6.0.0')).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledExactlyOnceWith('hashin', {
      srcDir: expect.any(String),
      name: 'hashin',
      extraToolEnvs: ['python'],
    });
  });

  test.each<{
    tool: string;
    svc: Newable<PipBaseInstallService>;
    expected: string;
  }>([
    { tool: 'hashin', svc: HashinInstallService, expected: 'hashin' },
    { tool: 'pip-tools', svc: PipToolsInstallService, expected: 'pip-compile' },
  ])('test: $tool', async ({ svc, expected }) => {
    const install = await child.getAsync(svc);

    await expect(install.test('1.0.0')).resolves.toBeUndefined();

    expect(execaMock).toHaveBeenCalledWith(
      expected,
      ['--version'],
      expect.any(Object),
    );
  });

  test('validate', async () => {
    const svc = await child.getAsync(HashinInstallService);

    expect(await svc.validate('1.0.0')).toBe(true);
    expect(await svc.validate('1.0.0.dev1')).toBe(true);
    expect(await svc.validate('not-a-version')).toBe(false);
  });

  test('throws without a current python', async () => {
    const verSvc = await child.getAsync(VersionService);
    await verSvc.removeCurrent('python');
    try {
      const svc = await child.getAsync(HashinInstallService);
      await expect(svc.isInstalled('1.0.0')).rejects.toThrow(
        'Python not installed',
      );
    } finally {
      await verSvc.setCurrent({
        name: 'python',
        tool: { name: 'python', version: pythonVersion },
      });
    }
  });
});

import fs from 'node:fs/promises';
import { arch } from 'node:os';
import { join } from 'node:path';
import { codeBlock } from 'common-tags';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  CompressionService,
  EnvService,
  LinkToolService,
} from '../../services/index.ts';
import { getDistro } from '../../utils/index.ts';
import { PythonInstallService, PythonPrepareService } from './index.ts';
import { scope } from '~test/http-mock.ts';
import { ensurePaths } from '~test/path.ts';
import { checksum, toolContext } from '~test/tool.ts';

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock('execa', () => ({ execa: execaMock }));
vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:os')>()),
  arch: vi.fn(() => 'x64'),
}));
vi.mock('../../utils/index.ts', async (importActual) => ({
  ...(await importActual<typeof import('../../utils/index.ts')>()),
  getDistro: vi.fn(),
}));

const githubUrl = 'https://github.com';
const archive = 'python archive';

/** The prebuild download path for `version`, `codename` and `ghArch`. */
function prebuildPath(
  version: string,
  codename: string,
  ghArch: string,
): string {
  return `/containerbase/python-prebuild/releases/download/${version}/python-${version}-${codename}-${ghArch}.tar.xz`;
}

/** Mocks the prebuild and its `.sha512` checksum file. */
function mockPrebuild(version: string, ghArch = 'x86_64'): void {
  const path = prebuildPath(version, 'jammy', ghArch);
  scope(githubUrl)
    .get(`${path}.sha512`)
    .reply(200, `${checksum(archive, 'sha512')}\n`)
    .get(path)
    .reply(200, archive);
}

describe('cli/tools/python/index', () => {
  beforeAll(async () => {
    await ensurePaths([
      'tmp',
      'home/ubuntu',
      'usr/local/etc',
      'opt/containerbase/bin',
      'opt/containerbase/tools',
    ]);
  });

  beforeEach(() => {
    vi.mocked(arch).mockReturnValue('x64');
    vi.mocked(getDistro).mockResolvedValue({
      name: 'Ubuntu',
      versionCode: 'jammy',
      versionId: '22.04',
    });
    // CI configures an apt proxy, which `AptService` would write to `/etc`
    vi.stubEnv('APT_HTTP_PROXY', undefined);
    execaMock.mockResolvedValue({ failed: false });
  });

  describe('PythonPrepareService', () => {
    test.each(['jammy', 'noble', 'resolute'])('prepare on %s', async (code) => {
      vi.mocked(getDistro).mockResolvedValue({
        name: 'Ubuntu',
        versionCode: code,
        versionId: '24.04',
      });
      vi.stubEnv('PATH', '/usr/bin');
      vi.stubEnv('PIP_DISABLE_PIP_VERSION_CHECK', undefined);
      const { svc, child, pathSvc } = await toolContext(PythonPrepareService);
      const envSvc = await child.getAsync(EnvService);
      const localBin = join(envSvc.userHome, '.local/bin');

      await expect(svc.prepare()).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledWith(
        'apt-get',
        expect.arrayContaining([
          'default-libmysqlclient-dev',
          'gcc',
          'libpq-dev',
        ]),
        { env: { DEBIAN_FRONTEND: 'noninteractive' } },
      );
      expect(await fs.readlink(join(envSvc.rootDir, 'usr/local/python'))).toBe(
        pathSvc.toolPath('python'),
      );
      const envFile = await fs.readFile(pathSvc.envFile, 'utf8');
      expect(envFile).toContain(`export PATH=${localBin}:$PATH\n`);
      expect(envFile).toContain(
        'export PIP_DISABLE_PIP_VERSION_CHECK=${PIP_DISABLE_PIP_VERSION_CHECK-1}\n',
      );
      expect(process.env.PATH).toBe(`${localBin}:/usr/bin`);
      expect(process.env.PIP_DISABLE_PIP_VERSION_CHECK).toBe('1');
    });

    test('prepare: throws on an unsupported distro', async () => {
      vi.mocked(getDistro).mockResolvedValue({
        name: 'Ubuntu',
        versionCode: 'focal',
        versionId: '20.04',
      });
      const { svc } = await toolContext(PythonPrepareService);

      await expect(svc.prepare()).rejects.toThrow(
        "Tool 'python' not supported on: focal!",
      );
    });
  });

  describe('PythonInstallService', () => {
    test.each([
      { code: 'jammy', hostArch: 'x64', ghArch: 'x86_64', version: '3.12.1' },
      {
        code: 'noble',
        hostArch: 'arm64',
        ghArch: 'aarch64',
        version: '3.12.2',
      },
      {
        code: 'resolute',
        hostArch: 'x64',
        ghArch: 'x86_64',
        version: '3.12.3',
      },
    ] as const)(
      'install $version on $code for $ghArch',
      async ({ code, hostArch, ghArch, version }) => {
        vi.mocked(arch).mockReturnValue(hostArch);
        vi.mocked(getDistro).mockResolvedValue({
          name: 'Ubuntu',
          versionCode: code,
          versionId: '24.04',
        });
        const { svc, pathSvc } = await toolContext(PythonInstallService);
        mockPrebuild(version, ghArch);
        const bin = join(pathSvc.versionedToolPath('python', version), 'bin');
        const extract = vi
          .spyOn(CompressionService.prototype, 'extract')
          .mockImplementation(async () => {
            await fs.mkdir(bin, { recursive: true });
          });

        await expect(svc.install(version)).resolves.toBeUndefined();

        expect(extract).toHaveBeenCalledExactlyOnceWith({
          file: expect.stringContaining(
            `python-${version}-jammy-${ghArch}.tar.xz`,
          ),
          cwd: pathSvc.toolPath('python'),
        });
        expect(execaMock).toHaveBeenCalledExactlyOnceWith(
          join(bin, 'python'),
          [
            '-W',
            'ignore',
            '-m',
            'pip',
            'install',
            '--compile',
            '--no-warn-script-location',
            '--no-cache-dir',
            '--quiet',
            '--upgrade',
            'pip',
            'virtualenv',
          ],
          expect.objectContaining({
            env: { PIP_ROOT_USER_ACTION: 'ignore', PIP_USE_PEP517: 'true' },
          }),
        );
      },
    );

    test('install: fixes the python shebangs', async () => {
      const version = '3.11.7';
      const { svc, pathSvc } = await toolContext(PythonInstallService);
      mockPrebuild(version);
      const bin = join(pathSvc.versionedToolPath('python', version), 'bin');
      const files: Record<string, string> = {
        pip: codeBlock`
          #!/build/python/bin/python
          import pip
        `,
        pip3: codeBlock`
          #!/usr/local/bin/python3
          import pip
        `,
        'pip3.11': codeBlock`
          #!/build/bin/python3.11
          import pip
        `,
        idle: '#!/build/bin/python3.11',
        'lib/tool': '#!/build/bin/python\n',
        '2to3': '#!/build/bin/python3.12\n',
        env: '#!/usr/bin/env python3\n',
        script: '#!/bin/sh\n',
        empty: '',
      };
      vi.spyOn(CompressionService.prototype, 'extract').mockImplementation(
        async () => {
          await fs.mkdir(join(bin, 'lib'), { recursive: true });
          for (const [name, content] of Object.entries(files)) {
            await fs.writeFile(join(bin, name), content);
          }
          // a binary with a python shebang in front of a NUL byte
          await fs.writeFile(
            join(bin, 'python3.11'),
            Buffer.from('#!/build/bin/python\n\0ELF'),
          );
          await fs.symlink('python3.11', join(bin, 'python'));
        },
      );

      await expect(svc.install(version)).resolves.toBeUndefined();

      const read = (name: string): Promise<string> =>
        fs.readFile(join(bin, name), 'utf8');
      expect(await read('pip')).toBe(codeBlock`
        #!${bin}/python
        import pip
      `);
      expect(await read('pip3')).toBe(codeBlock`
        #!${bin}/python3
        import pip
      `);
      expect(await read('pip3.11')).toBe(codeBlock`
        #!${bin}/python3.11
        import pip
      `);
      expect(await read('idle')).toBe(`#!${bin}/python3.11`);
      expect(await read('lib/tool')).toBe(`#!${bin}/python\n`);
      // other python versions, other interpreters and binaries are kept
      expect(await read('2to3')).toBe(files['2to3']);
      expect(await read('env')).toBe(files.env);
      expect(await read('script')).toBe(files.script);
      expect(await read('empty')).toBe('');
      expect(await read('python3.11')).toBe('#!/build/bin/python\n\0ELF');
      expect(await fs.readlink(join(bin, 'python'))).toBe('python3.11');
    });

    test('install: uses the replaced pip index', async () => {
      vi.stubEnv('URL_REPLACE_0_FROM', 'https://pypi.org/simple/');
      vi.stubEnv('URL_REPLACE_0_TO', 'https://pypi.example.com/simple/');
      const version = '3.13.0';
      const { svc, pathSvc } = await toolContext(PythonInstallService);
      mockPrebuild(version);
      const bin = join(pathSvc.versionedToolPath('python', version), 'bin');
      vi.spyOn(CompressionService.prototype, 'extract').mockImplementation(
        async () => {
          await fs.mkdir(bin, { recursive: true });
        },
      );

      await expect(svc.install(version)).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledExactlyOnceWith(
        join(bin, 'python'),
        expect.any(Array),
        expect.objectContaining({
          env: {
            PIP_ROOT_USER_ACTION: 'ignore',
            PIP_USE_PEP517: 'true',
            PIP_INDEX_URL: 'https://pypi.example.com/simple/',
          },
        }),
      );
    });

    test('link', async () => {
      const { svc, pathSvc } = await toolContext(PythonInstallService);
      const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');
      const srcDir = join(pathSvc.versionedToolPath('python', '3.12.1'), 'bin');

      await expect(svc.link('3.12.1')).resolves.toBeUndefined();

      expect(spy.mock.calls).toEqual(
        ['python', 'python3', 'python3.12', 'pip', 'pip3', 'pip3.12'].map(
          (name) => ['python', { srcDir, name }],
        ),
      );
    });

    test('runs the tool test', async () => {
      const { svc } = await toolContext(PythonInstallService);

      await expect(svc.test('3.12.1')).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledWith(
        'python',
        ['--version'],
        expect.any(Object),
      );
      expect(execaMock).toHaveBeenCalledWith(
        'pip',
        ['--version'],
        expect.objectContaining({ env: { PYTHONWARNINGS: 'ignore' } }),
      );
    });
  });
});

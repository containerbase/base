import fs from 'node:fs/promises';
import { arch } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { LinkToolService, PathService } from '../../services/index.ts';
import { DockerComposeInstallService } from './compose.ts';
import { scope } from '~test/http-mock.ts';
import { ensurePaths } from '~test/path.ts';
import { checksum, toolContext } from '~test/tool.ts';

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock('execa', () => ({ execa: execaMock }));
vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:os')>()),
  arch: vi.fn(() => 'x64'),
}));

const baseUrl = 'https://github.com';
const binary = 'compose binary';

describe('cli/tools/docker/compose', () => {
  beforeAll(async () => {
    await ensurePaths(['tmp', 'opt/containerbase/bin']);
  });

  beforeEach(() => {
    vi.mocked(arch).mockReturnValue('x64');
    execaMock.mockResolvedValue({ failed: false });
  });

  test.each([
    { hostArch: 'x64', ghArch: 'x86_64', version: '2.29.7' },
    { hostArch: 'arm64', ghArch: 'aarch64', version: '2.29.8' },
  ] as const)('install on $ghArch', async ({ hostArch, ghArch, version }) => {
    vi.mocked(arch).mockReturnValue(hostArch);
    const { svc, pathSvc } = await toolContext(DockerComposeInstallService);
    const filename = `docker-compose-linux-${ghArch}`;
    const releaseUrl = `/docker/compose/releases/download/v${version}`;
    scope(baseUrl)
      .get(`${releaseUrl}/checksums.txt`)
      .reply(200, `${checksum(binary)} ${filename}\n`)
      .get(`${releaseUrl}/${filename}`)
      .reply(200, binary);

    await expect(svc.install(version)).resolves.toBeUndefined();

    const bin = join(
      pathSvc.versionedToolPath('docker-compose', version),
      'bin',
      'docker-compose',
    );
    expect(await fs.readFile(bin, 'utf8')).toBe(binary);
    expect((await fs.stat(bin)).mode & 0o777).toBe(0o775);
  });

  test('install: without a checksum before v2.5.0', async () => {
    const { svc, pathSvc } = await toolContext(DockerComposeInstallService);
    scope(baseUrl)
      .get(
        '/docker/compose/releases/download/v2.4.1/docker-compose-linux-x86_64',
      )
      .reply(200, binary);

    await expect(svc.install('2.4.1')).resolves.toBeUndefined();

    expect(
      await fs.readFile(
        join(
          pathSvc.versionedToolPath('docker-compose', '2.4.1'),
          'bin',
          'docker-compose',
        ),
        'utf8',
      ),
    ).toBe(binary);
  });

  test('link', async () => {
    const { svc, child } = await toolContext(DockerComposeInstallService);
    const pathSvc = await child.getAsync(PathService);
    const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');
    const src = join(
      pathSvc.versionedToolPath('docker-compose', '2.29.7'),
      'bin',
    );
    const plugin = join(
      pathSvc.cachePath,
      '.docker/cli-plugins/docker-compose',
    );
    await pathSvc.createDir(join(pathSvc.cachePath, '.docker/cli-plugins'));

    await expect(svc.link('2.29.7')).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledExactlyOnceWith('docker-compose', {
      srcDir: src,
    });
    expect(await fs.readlink(plugin)).toBe(join(src, 'docker-compose'));

    // an existing plugin link is replaced
    await expect(svc.link('2.29.7')).resolves.toBeUndefined();
    expect(await fs.readlink(plugin)).toBe(join(src, 'docker-compose'));
  });

  test('runs the tool test', async () => {
    const { svc } = await toolContext(DockerComposeInstallService);

    await expect(svc.test('2.29.7')).resolves.toBeUndefined();

    expect(execaMock).toHaveBeenCalledWith(
      'docker',
      ['compose', 'version'],
      expect.any(Object),
    );
  });

  test('validate rejects versions before v2.0.1', async () => {
    const { svc } = await toolContext(DockerComposeInstallService);

    expect(await svc.validate('2.29.7')).toBe(true);
    expect(await svc.validate('1.29.2')).toBe(false);
    expect(await svc.validate('not-a-version')).toBe(false);
  });
});

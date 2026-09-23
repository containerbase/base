import { arch } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { CompressionService, LinkToolService } from '../services/index.ts';
import { TerraformInstallService } from './terraform.ts';
import { scope } from '~test/http-mock.ts';
import { ensurePaths } from '~test/path.ts';
import { checksum, toolContext } from '~test/tool.ts';

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock('execa', () => ({ execa: execaMock }));
vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:os')>()),
  arch: vi.fn(() => 'x64'),
}));

const baseUrl = 'https://releases.hashicorp.com';
const archive = 'terraform archive';

describe('cli/tools/terraform', () => {
  beforeAll(async () => {
    await ensurePaths(['tmp', 'opt/containerbase/bin']);
  });

  beforeEach(() => {
    vi.mocked(arch).mockReturnValue('x64');
    execaMock.mockResolvedValue({ failed: false });
  });

  test.each([
    { hostArch: 'x64', toolArch: 'amd64', version: '1.16.2' },
    { hostArch: 'arm64', toolArch: 'arm64', version: '1.16.3' },
  ] as const)(
    'install on $toolArch',
    async ({ hostArch, toolArch, version }) => {
      vi.mocked(arch).mockReturnValue(hostArch);
      const { svc, pathSvc } = await toolContext(TerraformInstallService);
      const filename = `terraform_${version}_linux_${toolArch}.zip`;
      scope(baseUrl)
        .get(`/terraform/${version}/terraform_${version}_SHA256SUMS`)
        .reply(
          200,
          // `linux_arm` is a prefix of `linux_arm64`, so it must not match
          `${checksum('other')}  terraform_${version}_linux_arm.zip\n${checksum(archive)}  ${filename}\n`,
        )
        .get(`/terraform/${version}/${filename}`)
        .reply(200, archive);
      const extract = vi.spyOn(CompressionService.prototype, 'extract');

      await expect(svc.install(version)).resolves.toBeUndefined();

      expect(extract).toHaveBeenCalledExactlyOnceWith({
        file: expect.stringContaining(filename),
        cwd: join(pathSvc.versionedToolPath('terraform', version), 'bin'),
      });
    },
  );

  test('install: rejects a missing checksum', async () => {
    const { svc } = await toolContext(TerraformInstallService);
    scope(baseUrl)
      .get('/terraform/1.16.0/terraform_1.16.0_SHA256SUMS')
      .reply(200, `${checksum('other')}  terraform_1.16.0_linux_arm.zip\n`);

    await expect(svc.install('1.16.0')).rejects.toThrow(
      'Checksum for terraform_1.16.0_linux_amd64.zip not found',
    );
  });

  test('install: rejects a checksum mismatch', async () => {
    const { svc } = await toolContext(TerraformInstallService);
    scope(baseUrl)
      .get('/terraform/1.16.1/terraform_1.16.1_SHA256SUMS')
      .reply(200, `${checksum('other')}  terraform_1.16.1_linux_amd64.zip\n`)
      .get('/terraform/1.16.1/terraform_1.16.1_linux_amd64.zip')
      .times(3)
      .reply(200, archive);

    await expect(svc.install('1.16.1')).rejects.toThrow('download failed');
  });

  test('link', async () => {
    const { svc, pathSvc } = await toolContext(TerraformInstallService);
    const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');

    await expect(svc.link('1.16.3')).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledExactlyOnceWith('terraform', {
      srcDir: join(pathSvc.versionedToolPath('terraform', '1.16.3'), 'bin'),
    });
  });

  test('runs the tool test', async () => {
    const { svc } = await toolContext(TerraformInstallService);

    await expect(svc.test('1.16.3')).resolves.toBeUndefined();

    expect(execaMock).toHaveBeenCalledWith(
      'terraform',
      ['version'],
      expect.any(Object),
    );
  });
});

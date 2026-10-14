import fs from 'node:fs/promises';
import { arch } from 'node:os';
import { join } from 'node:path';
import { codeBlock } from 'common-tags';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { LinkToolService } from '../services/index.ts';
import { JqInstallService } from './jq.ts';
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
const releaseUrl = '/jqlang/jq/releases/download';
const binary = 'jq binary';

describe('cli/tools/jq', () => {
  beforeAll(async () => {
    await ensurePaths(['tmp', 'opt/containerbase/bin']);
  });

  beforeEach(() => {
    vi.mocked(arch).mockReturnValue('x64');
    execaMock.mockResolvedValue({ failed: false });
  });

  test.each([
    { hostArch: 'x64', toolArch: 'amd64', version: '1.8.1' },
    { hostArch: 'arm64', toolArch: 'arm64', version: '1.8.2' },
  ] as const)(
    'install on $toolArch',
    async ({ hostArch, toolArch, version }) => {
      vi.mocked(arch).mockReturnValue(hostArch);
      const { svc, pathSvc } = await toolContext(JqInstallService);
      const filename = `jq-linux-${toolArch}`;
      scope(baseUrl)
        .get(`${releaseUrl}/jq-${version}/sha256sum.txt`)
        .reply(
          200,
          codeBlock`
            ${checksum('other')}  jq-macos-${toolArch}
            ${checksum(binary)}  ${filename}
          `,
        )
        .get(`${releaseUrl}/jq-${version}/${filename}`)
        .reply(200, binary);

      await expect(svc.install(version)).resolves.toBeUndefined();

      const file = join(pathSvc.versionedToolPath('jq', version), 'bin', 'jq');
      expect(await fs.readFile(file, 'utf8')).toBe(binary);
      expect((await fs.stat(file)).mode & 0o777).toBe(0o775);
    },
  );

  test('install: rejects a missing checksum', async () => {
    const { svc } = await toolContext(JqInstallService);
    scope(baseUrl)
      .get(`${releaseUrl}/jq-1.8.3/sha256sum.txt`)
      .reply(200, `${checksum('other')}  jq-macos-amd64\n`);

    await expect(svc.install('1.8.3')).rejects.toThrow(
      `Checksum not found in ${baseUrl}${releaseUrl}/jq-1.8.3/sha256sum.txt for jq-linux-amd64`,
    );
  });

  test('install: rejects a checksum mismatch', async () => {
    const { svc } = await toolContext(JqInstallService);
    scope(baseUrl)
      .get(`${releaseUrl}/jq-1.8.4/sha256sum.txt`)
      .reply(200, `${checksum('other')}  jq-linux-amd64\n`)
      .get(`${releaseUrl}/jq-1.8.4/jq-linux-amd64`)
      .times(3)
      .reply(200, binary);

    await expect(svc.install('1.8.4')).rejects.toThrow('download failed');
  });

  test('link', async () => {
    const { svc, pathSvc } = await toolContext(JqInstallService);
    const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');

    await expect(svc.link('1.8.2')).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledExactlyOnceWith('jq', {
      srcDir: join(pathSvc.versionedToolPath('jq', '1.8.2'), 'bin'),
    });
  });

  test('runs the tool test', async () => {
    const { svc } = await toolContext(JqInstallService);

    await expect(svc.test('1.8.2')).resolves.toBeUndefined();

    expect(execaMock).toHaveBeenCalledWith(
      'jq',
      ['--version'],
      expect.any(Object),
    );
  });
});

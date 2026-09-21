import fs from 'node:fs/promises';
import { arch } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { CompressionService, LinkToolService } from '../services/index.ts';
import { BunInstallService } from './bun.ts';
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
const zip = 'bun archive';

/**
 * On `amd64` the install reads `/proc/cpuinfo` first, to pick the baseline
 * build on cpus without `avx2`.
 */
function mockCpuInfo(flags: string | Error): void {
  const spy = vi.spyOn(fs, 'readFile');
  if (flags instanceof Error) {
    spy.mockRejectedValueOnce(flags);
  } else {
    spy.mockResolvedValueOnce(flags);
  }
}

describe('cli/tools/bun', () => {
  beforeAll(async () => {
    await ensurePaths(['tmp', 'opt/containerbase/bin']);
  });

  beforeEach(() => {
    vi.mocked(arch).mockReturnValue('x64');
    execaMock.mockResolvedValue({ failed: false });
  });

  test.each([
    {
      hostArch: 'x64',
      cpuInfo: 'flags: avx2 sse',
      ghArch: 'x64',
      version: '1.2.0',
    },
    {
      hostArch: 'x64',
      cpuInfo: 'flags: sse',
      ghArch: 'x64-baseline',
      version: '1.2.1',
    },
    {
      hostArch: 'x64',
      cpuInfo: new Error('no cpuinfo'),
      ghArch: 'x64-baseline',
      version: '1.2.2',
    },
    {
      hostArch: 'arm64',
      cpuInfo: null,
      ghArch: 'aarch64',
      version: '1.2.3',
    },
  ] as const)(
    'install on $ghArch',
    async ({ hostArch, cpuInfo, ghArch, version }) => {
      vi.mocked(arch).mockReturnValue(hostArch);
      if (cpuInfo !== null) {
        mockCpuInfo(cpuInfo);
      }
      const { svc, pathSvc } = await toolContext(BunInstallService);
      const filename = `bun-linux-${ghArch}.zip`;
      const releaseUrl = `/oven-sh/bun/releases/download/bun-v${version}`;
      scope(baseUrl)
        .get(`${releaseUrl}/SHASUMS256.txt`)
        .reply(200, `${checksum(zip)} ${filename}\n`)
        .get(`${releaseUrl}/${filename}`)
        .reply(200, zip);
      const extract = vi.spyOn(CompressionService.prototype, 'extract');

      await expect(svc.install(version)).resolves.toBeUndefined();

      expect(extract).toHaveBeenCalledExactlyOnceWith({
        file: expect.stringContaining(filename),
        cwd: join(pathSvc.versionedToolPath('bun', version), 'bin'),
        strip: 1,
      });
    },
  );

  test('link', async () => {
    const { svc, pathSvc } = await toolContext(BunInstallService);
    const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');

    await expect(svc.link('1.2.0')).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledExactlyOnceWith('bun', {
      srcDir: join(pathSvc.versionedToolPath('bun', '1.2.0'), 'bin'),
    });
  });

  test('runs the tool test', async () => {
    const { svc } = await toolContext(BunInstallService);

    await expect(svc.test('1.2.0')).resolves.toBeUndefined();

    expect(execaMock).toHaveBeenCalledWith(
      'bun',
      ['--version'],
      expect.any(Object),
    );
  });
});

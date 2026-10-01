import { arch } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { CompressionService, LinkToolService } from '../services/index.ts';
import { ProtocInstallService } from './protoc.ts';
import { scope } from '~test/http-mock.ts';
import { ensurePaths } from '~test/path.ts';
import { toolContext } from '~test/tool.ts';

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock('execa', () => ({ execa: execaMock }));
vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:os')>()),
  arch: vi.fn(() => 'x64'),
}));

const baseUrl = 'https://github.com';

describe('cli/tools/protoc', () => {
  beforeAll(async () => {
    await ensurePaths(['tmp', 'opt/containerbase/bin']);
  });

  beforeEach(() => {
    vi.mocked(arch).mockReturnValue('x64');
    execaMock.mockResolvedValue({ failed: false });
  });

  test.each([
    { hostArch: 'x64', ghArch: 'x86_64', version: '28.3' },
    { hostArch: 'arm64', ghArch: 'aarch_64', version: '28.4' },
  ] as const)('install on $ghArch', async ({ hostArch, ghArch, version }) => {
    vi.mocked(arch).mockReturnValue(hostArch);
    const { svc, pathSvc } = await toolContext(ProtocInstallService);
    const filename = `protoc-${version}-linux-${ghArch}.zip`;
    scope(baseUrl)
      .get(
        `/protocolbuffers/protobuf/releases/download/v${version}/${filename}`,
      )
      .reply(200, 'protoc archive');
    const extract = vi.spyOn(CompressionService.prototype, 'extract');

    await expect(svc.install(version)).resolves.toBeUndefined();

    expect(extract).toHaveBeenCalledExactlyOnceWith({
      file: expect.stringContaining(filename),
      cwd: pathSvc.versionedToolPath('protoc', version),
    });
  });

  test('link', async () => {
    const { svc, pathSvc } = await toolContext(ProtocInstallService);
    const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');

    await expect(svc.link('28.3')).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledExactlyOnceWith('protoc', {
      srcDir: join(pathSvc.versionedToolPath('protoc', '28.3'), 'bin'),
    });
  });

  test('runs the tool test', async () => {
    const { svc } = await toolContext(ProtocInstallService);

    await expect(svc.test('28.3')).resolves.toBeUndefined();

    expect(execaMock).toHaveBeenCalledWith(
      'protoc',
      ['--version'],
      expect.any(Object),
    );
  });

  test('validate coerces the two part versions', async () => {
    const { svc } = await toolContext(ProtocInstallService);

    expect(await svc.validate('28.3')).toBe(true);
    expect(await svc.validate('28.3.1')).toBe(true);
    expect(await svc.validate('not-a-version')).toBe(false);
  });
});

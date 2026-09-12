import fs from 'node:fs/promises';
import { arch } from 'node:os';
import { join } from 'node:path';
import type { Container } from 'inversify';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

import {
  CompressionService,
  HttpService,
  LinkToolService,
} from '../services/index.ts';
import {
  VP_SYNC_VERSIONS_UNAVAILABLE,
  VpInstallService,
  parseVitePlusChecksum,
  vitePlusAssetName,
} from './vp.ts';
import { testContainer } from '~test/di.ts';
import { ensurePaths } from '~test/path.ts';

vi.mock('execa');

describe('cli/tools/vp', () => {
  describe('release assets', () => {
    test.each([
      ['amd64', 'vp-x86_64-unknown-linux-gnu.tar.gz'],
      ['arm64', 'vp-aarch64-unknown-linux-gnu.tar.gz'],
    ] as const)('maps %s to the official release asset', (arch, expected) => {
      expect(vitePlusAssetName(arch)).toBe(expected);
    });

    test('selects an exact release asset checksum', () => {
      expect(
        parseVitePlusChecksum(
          [
            'a'.repeat(64) + '  vp-aarch64-unknown-linux-gnu.tar.gz',
            'b'.repeat(64) + '  vp-x86_64-unknown-linux-gnu.tar.gz',
            '',
          ].join('\n'),
          'vp-x86_64-unknown-linux-gnu.tar.gz',
        ),
      ).toBe('b'.repeat(64));
    });

    test('rejects missing or malformed checksums', () => {
      expect(() =>
        parseVitePlusChecksum('', 'vp-x86_64-unknown-linux-gnu.tar.gz'),
      ).toThrow('Cannot find checksum');
      expect(() =>
        parseVitePlusChecksum(
          'not-a-checksum  vp-x86_64-unknown-linux-gnu.tar.gz',
          'vp-x86_64-unknown-linux-gnu.tar.gz',
        ),
      ).toThrow('Cannot find checksum');
    });
  });

  describe('VpInstallService', () => {
    let child: Container;
    let service: VpInstallService;

    beforeAll(async () => {
      await ensurePaths([
        'opt/containerbase/bin',
        'opt/containerbase/tools',
        'tmp/containerbase',
        'var/lib/containerbase',
      ]);
    });

    beforeEach(async () => {
      child = await testContainer();
      child.bind(HttpService).toSelf();
      child.bind(CompressionService).toSelf();
      child.bind(LinkToolService).toSelf();
      child.bind(VpInstallService).toSelf();
      service = await child.getAsync(VpInstallService);
    });

    test('downloads, verifies, and extracts the exact prebuilt release', async () => {
      const filename = vitePlusAssetName(
        arch() === 'arm64' ? 'arm64' : 'amd64',
      );
      const checksum = 'c'.repeat(64);
      const checksumFile = join(globalThis.cacheDir, 'vp-checksums.txt');
      const archiveFile = join(globalThis.cacheDir, filename);
      await fs.writeFile(checksumFile, `${checksum}  ${filename}\n`);
      await fs.writeFile(archiveFile, 'archive');

      const download = vi
        .spyOn(HttpService.prototype, 'download')
        .mockResolvedValueOnce(checksumFile)
        .mockResolvedValueOnce(archiveFile);
      vi.spyOn(HttpService.prototype, 'exists').mockResolvedValueOnce(true);
      const extract = vi
        .spyOn(CompressionService.prototype, 'extract')
        .mockResolvedValueOnce();

      await service.install('0.4.0');

      expect(download).toHaveBeenNthCalledWith(1, {
        url: 'https://github.com/voidzero-dev/vite-plus/releases/download/v0.4.0/vp-checksums.txt',
      });
      expect(download).toHaveBeenNthCalledWith(2, {
        url: `https://github.com/voidzero-dev/vite-plus/releases/download/v0.4.0/${filename}`,
        checksumType: 'sha256',
        expectedChecksum: checksum,
      });
      expect(extract).toHaveBeenCalledWith({
        file: archiveFile,
        cwd: expect.stringMatching(/\/vp\/0\.4\.0\/bin$/),
      });
    });

    test('rejects releases that predate the bundled planner', async () => {
      vi.spyOn(HttpService.prototype, 'exists').mockResolvedValueOnce(false);
      const download = vi.spyOn(HttpService.prototype, 'download');

      await expect(service.install('0.3.0')).rejects.toThrow(
        `${VP_SYNC_VERSIONS_UNAVAILABLE}:0.3.0`,
      );
      expect(download).not.toHaveBeenCalled();
    });

    test('links vp with the Node runtime needed by the bundled planner', async () => {
      const shellwrapper = vi
        .spyOn(LinkToolService.prototype, 'shellwrapper')
        .mockResolvedValueOnce();

      await service.link('0.4.0');

      expect(shellwrapper).toHaveBeenCalledWith('vp', {
        srcDir: expect.stringMatching(/\/vp\/0\.4\.0\/bin$/),
        extraToolEnvs: ['node'],
      });
    });

    test('checks the installed vp version', async () => {
      await expect(service.test('0.4.0')).resolves.toBeUndefined();
    });
  });
});

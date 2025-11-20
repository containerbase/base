import fs from 'node:fs/promises';
import { join } from 'node:path';
import { execa } from 'execa';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../../install-tool/base-install.service';
import { pathExists, semverGte } from '../../utils';

@injectable()
@injectFromHierarchy()
export class BuildxInstallService extends BaseInstallService {
  readonly name = 'buildx';

  override readonly parent = 'docker';

  override async install(version: string): Promise<void> {
    const baseUrl = `https://github.com/docker/${this.name}/releases/download/v${version}/`;
    const filename = `${this.name}-v${version}.linux-${this.envSvc.arch}`;

    let expectedChecksum: string | undefined;
    if (semverGte(version, '0.7.0')) {
      const checksumFile = await this.http.download({
        url: `${baseUrl}checksums.txt`,
      });
      expectedChecksum = (await fs.readFile(checksumFile, 'utf-8'))
        .split('\n')
        .find((l) => l.includes(filename))
        ?.split(' ')[0];
    }

    const file = await this.http.download({
      url: `${baseUrl}${filename}`,
      checksumType: 'sha256',
      expectedChecksum,
    });

    await this.pathSvc.ensureToolPath(this.name);

    const path = join(
      await this.pathSvc.createVersionedToolPath(this.name, version),
      'bin',
    );
    await fs.mkdir(path);
    const bin = join(path, this.name);
    await fs.copyFile(file, bin);
    await fs.chmod(bin, this.envSvc.umask);
  }

  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');

    // to track linked version
    await this.shellwrapper({ srcDir: src });

    const tgt = join(
      this.envSvc.userHome,
      `.docker/cli-plugins/docker-${this.name}`,
    );
    if (await pathExists(tgt)) {
      await fs.rm(tgt);
    }
    await fs.symlink(src, tgt);
  }

  override async test(_version: string): Promise<void> {
    await execa('docker', ['buildx', '--version'], {
      stdio: ['inherit', 'inherit', 1],
    });
  }
}

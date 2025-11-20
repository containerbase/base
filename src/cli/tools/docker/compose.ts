import fs from 'node:fs/promises';
import { join } from 'node:path';
import { execa } from 'execa';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../../install-tool/base-install.service';
import { pathExists, semverGte } from '../../utils';

@injectable()
@injectFromHierarchy()
export class DockerComposeInstallService extends BaseInstallService {
  readonly name = 'docker-compose';
  override readonly parent = 'docker';

  private get ghArch(): string {
    switch (this.envSvc.arch) {
      case 'arm64':
        return 'aarch64';
      case 'amd64':
        return 'x86_64';
    }
  }

  override async install(version: string): Promise<void> {
    const baseUrl = `https://github.com/docker/${this.name}/releases/download/v${version}/`;
    const filename = `${this.name}-linux-${this.ghArch}`;

    let expectedChecksum: string | undefined;
    if (semverGte(version, '2.5.0')) {
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

    const tgt = join(this.envSvc.userHome, `.docker/cli-plugins/${this.name}`);
    if (await pathExists(tgt)) {
      await fs.rm(tgt);
    }
    await fs.symlink(src, tgt);
  }

  override async test(_version: string): Promise<void> {
    await execa('docker', ['compose', '--version'], {
      stdio: ['inherit', 'inherit', 1],
    });
  }

  override async validate(version: string): Promise<boolean> {
    return (await super.validate(version)) && semverGte(version, '2.0.1');
  }
}

import fs from 'node:fs/promises';
import path from 'node:path';
import { execa } from 'execa';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service';
import { getDistro, logger } from '../utils';

@injectable()
@injectFromHierarchy()
export class WallyInstallService extends BaseInstallService {
  readonly name = 'wally';

  private get ghArch(): string {
    switch (this.envSvc.arch) {
      case 'arm64':
        return 'aarch64';
      case 'amd64':
        return 'x86_64';
    }
  }

  override async install(version: string): Promise<void> {
    const name = this.name;
    const distro = await getDistro();
    let code = distro.versionCode;

    if (code === 'noble') {
      logger.debug(`Using jammy prebuild for ${name} on ${code}`);
      code = 'jammy';
    }
    const filename = `${name}-${version}-${code}-${this.ghArch}.tar.xz`;
    const url = `https://github.com/containerbase/${name}-prebuild/releases/download/${version}/${filename}`;
    const checksumFileUrl = `${url}.sha512`;

    const checksumFile = await this.http.download({ url: checksumFileUrl });
    const expectedChecksum = (await fs.readFile(checksumFile, 'utf-8')).trim();

    const file = await this.http.download({
      url,
      checksumType: 'sha512',
      expectedChecksum,
    });

    const cwd = await this.pathSvc.ensureToolPath(name);

    await this.compress.extract({ file, cwd });
  }

  override async link(version: string): Promise<void> {
    const src = path.join(
      this.pathSvc.versionedToolPath(this.name, version),
      'bin',
    );
    await this.shellwrapper({ srcDir: src });
  }

  override async test(_version: string): Promise<void> {
    await execa(this.name, ['--version'], {
      stdio: ['inherit', 'inherit', 1],
    });
  }
}

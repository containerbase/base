import fs from 'node:fs/promises';
import { join } from 'node:path';
import { execa } from 'execa';
import { inject, injectable } from 'inversify';
import { InstallToolBaseService } from '../../install-tool/install-tool-base.service';
import {
  CompressionService,
  EnvService,
  HttpService,
  PathService,
} from '../../services';
import type { HttpChecksumType } from '../../services/http.service';
import { logger } from '../../utils';

@injectable()
export class InstallComposerService extends InstallToolBaseService {
  readonly name = 'composer';

  constructor(
    @inject(EnvService) envSvc: EnvService,
    @inject(PathService) pathSvc: PathService,
    @inject(HttpService) private http: HttpService,
    @inject(CompressionService) private compress: CompressionService,
  ) {
    super(pathSvc, envSvc);
  }

  override async install(version: string): Promise<void> {
    const name = this.name;
    let filename = `${name}-${version}.tar.xz`;
    let url = `https://github.com/containerbase/${name}-prebuild/releases/download/${version}/${filename}`;
    let checksumFileUrl = `${url}.sha512`;
    const isOnGithub = await this.http.exists(checksumFileUrl);
    let file: string;

    if (isOnGithub) {
      logger.info(`using github`);
      const checksumFile = await this.http.download({ url: checksumFileUrl });
      const expectedChecksum = (
        await fs.readFile(checksumFile, 'utf-8')
      ).trim();
      file = await this.http.download({
        url,
        checksumType: 'sha512',
        expectedChecksum,
      });
    } else {
      logger.info(`using getcomposer.org`);
      // fallback to getcomposer.org
      filename = `composer.phar`;
      url = `https://getcomposer.org/download/${version}/composer.phar`;
      checksumFileUrl = `${url}.sha256sum`;
      let expectedChecksum: string | undefined;
      let checksumType: HttpChecksumType | undefined;
      if (await this.http.exists(checksumFileUrl)) {
        logger.debug(`using sha256sum checksum for ${filename}`);
        expectedChecksum = await this.readChecksum(`${url}.sha256sum`);
        checksumType = 'sha256';
      } else {
        throw new Error(`checksum file not found for ${filename}`);
      }

      if (!checksumType || !expectedChecksum) {
        throw new Error(`checksum not found for ${filename}`);
      }

      file = await this.http.download({
        url,
        checksumType,
        expectedChecksum,
      });
    }

    let path = await this.pathSvc.findToolPath(this.name);
    if (!path) {
      path = await this.pathSvc.createToolPath(this.name);
    }

    if (isOnGithub) {
      await this.compress.extract({ file, cwd: path });
    } else {
      // from getcomposer.org
      path = await this.pathSvc.createVersionedToolPath(this.name, version);
      path = join(path, 'bin');
      await fs.mkdir(path);
      path = join(path, filename);
      await fs.cp(file, path);
      await fs.chmod(path, 0o755);
    }
  }

  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');
    await this.shellwrapper({ srcDir: src });
  }

  override async test(_version: string): Promise<void> {
    await execa('composer', ['--version'], {
      stdio: ['inherit', 'inherit', 1],
    });
  }

  private async readChecksum(url: string): Promise<string | undefined> {
    const checksumFile = await this.http.download({ url });
    return (await fs.readFile(checksumFile, 'utf-8')).split(' ')[0]?.trim();
  }
}

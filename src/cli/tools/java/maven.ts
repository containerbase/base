import fs from 'node:fs/promises';
import { join } from 'node:path';
import { isNonEmptyStringAndNotWhitespace } from '@sindresorhus/is';
import { execa } from 'execa';
import { inject, injectable } from 'inversify';
import { InstallToolBaseService } from '../../install-tool/install-tool-base.service';
import { ToolVersionResolver } from '../../install-tool/tool-version-resolver';
import {
  CompressionService,
  EnvService,
  HttpService,
  PathService,
} from '../../services';
import type { HttpChecksumType } from '../../services/http.service';
import { logger, parse } from '../../utils';

@injectable()
export class InstallMavenService extends InstallToolBaseService {
  readonly name = 'maven';

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
    let strip: number | undefined;

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
      logger.info(`using archive.apache.org`);
      strip = 1;
      // fallback to archive.apache.org
      const ver = parse(version);
      filename = `apache-${name}-${version}-bin.tar.gz`;
      url = `https://archive.apache.org/dist/${name}/${name}-${ver.major}/${ver.version}/binaries/${filename}`;
      checksumFileUrl = `${url}.sha512`;
      let expectedChecksum: string | undefined;
      let checksumType: HttpChecksumType | undefined;
      if (await this.http.exists(checksumFileUrl)) {
        logger.debug(`using sha512 checksum for ${filename}`);
        expectedChecksum = await this.readChecksum(`${url}.sha512`);
        checksumType = 'sha512';
      } else if (await this.http.exists(`${url}.sha1`)) {
        logger.debug(`using sha1 checksum for ${filename}`);
        expectedChecksum = await this.readChecksum(`${url}.sha1`);
        checksumType = 'sha1';
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

    let path = await this.pathSvc.ensureToolPath(this.name);

    if (strip) {
      // from archive.apache.org
      path = await this.pathSvc.createVersionedToolPath(this.name, version);
    }

    await this.compress.extract({ file, cwd: path, strip });
  }

  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');
    await this.shellwrapper({ srcDir: src, name: 'mvn' });
  }

  override async test(_version: string): Promise<void> {
    // pkg bug, using `node` causes module load error
    await execa('mvn', ['--version'], {
      stdio: ['inherit', 'inherit', 1],
    });
  }

  private async readChecksum(url: string): Promise<string | undefined> {
    const checksumFile = await this.http.download({ url });
    return (await fs.readFile(checksumFile, 'utf-8')).split(' ')[0]?.trim();
  }
}

@injectable()
export class MavenVersionResolver extends ToolVersionResolver {
  readonly tool = 'maven';

  async resolve(version: string | undefined): Promise<string | undefined> {
    if (!isNonEmptyStringAndNotWhitespace(version) || version === 'latest') {
      return await this.http.get(
        `https://github.com/containerbase/${this.tool}-prebuild/releases/latest/download/version`,
      );
    }
    return version;
  }
}

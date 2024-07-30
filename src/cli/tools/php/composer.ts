import fs from 'node:fs/promises';
import { join } from 'node:path';
import { isNonEmptyStringAndNotWhitespace } from '@sindresorhus/is';
import { execa } from 'execa';
import { inject, injectable } from 'inversify';
import { sort } from 'semver';
import { z } from 'zod';
import { InstallToolBaseService } from '../../install-tool/install-tool-base.service';
import { ToolVersionResolver } from '../../install-tool/tool-version-resolver';
import {
  CompressionService,
  EnvService,
  HttpService,
  PathService,
} from '../../services';
import type { HttpChecksumType } from '../../services/http.service';
import { logger } from '../../utils';

@injectable()
export class ComposerInstallService extends InstallToolBaseService {
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

    let path = await this.pathSvc.ensureToolPath(this.name);

    if (isOnGithub) {
      await this.compress.extract({ file, cwd: path });
    } else {
      // from getcomposer.org
      path = await this.pathSvc.createVersionedToolPath(this.name, version);
      path = join(path, 'bin');
      await fs.mkdir(path);
      path = join(path, filename);
      await fs.cp(file, path);
      await fs.chmod(path, this.envSvc.umask);
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

@injectable()
export class ComposerVersionResolver extends ToolVersionResolver {
  readonly tool = 'composer';

  async resolve(version: string | undefined): Promise<string | undefined> {
    if (!isNonEmptyStringAndNotWhitespace(version) || version === 'latest') {
      const meta = ComposerVersionsSchema.parse(
        await this.http.getJson('https://getcomposer.org/versions'),
      );
      // we know that the latest version is the first entry, so search for first lts
      return meta;
    }
    return version;
  }
}

const ComposerVersionsSchema = z
  .object({
    stable: z.array(z.object({ version: z.string() })),
  })
  .transform(({ stable }) => {
    return sort(stable.map((v) => v.version)).pop();
  });

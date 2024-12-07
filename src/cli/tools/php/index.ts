import fs from 'node:fs/promises';
import { join } from 'node:path';
import { isNonEmptyStringAndNotWhitespace } from '@sindresorhus/is';
import { execa } from 'execa';
import { inject, injectable } from 'inversify';
import { BaseInstallService } from '../../install-tool/base-install.service';
import { ToolVersionResolver } from '../../install-tool/tool-version-resolver';
import { BasePrepareService } from '../../prepare-tool/base-prepare.service';
import {
  AptService,
  CompressionService,
  EnvService,
  HttpService,
  PathService,
} from '../../services';
import { getDistro, logger } from '../../utils';

@injectable()
export class PhpPrepareService extends BasePrepareService {
  override readonly name = 'php';

  constructor(
    @inject(PathService) pathSvc: PathService,
    @inject(EnvService) envSvc: EnvService,
    @inject(AptService) private readonly aptSvc: AptService,
  ) {
    super(pathSvc, envSvc);
  }

  override async prepare(): Promise<void> {
    const distro = await getDistro();

    switch (distro.versionCode) {
      case 'focal':
        await this.aptSvc.install(
          'libjpeg-turbo8',
          'libmcrypt4',
          'libonig5',
          'libpng16-16',
          'libtidy5deb1',
          'libxslt1.1',
          'libzip5',
        );
        break;

      case 'jammy':
      case 'noble':
        await this.aptSvc.install(
          'libjpeg-turbo8',
          'libmcrypt4',
          'libonig5',
          'libpng16-16',
          'libtidy5deb1',
          'libxslt1.1',
          'libzip4',
        );

        break;

      default:
        throw new Error(`Unsupported distro version: ${distro.versionCode}`);
    }
  }
}

@injectable()
export class PhpInstallService extends BaseInstallService {
  readonly name = 'php';

  private get ghArch(): string {
    switch (this.envSvc.arch) {
      case 'arm64':
        return 'aarch64';
      case 'amd64':
        return 'x86_64';
    }
  }

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
    const distro = await getDistro();
    let code = distro.versionCode;

    if (code === 'noble') {
      logger.debug(`Using jammy prebuild for ${name} on ${code}`);
      code = 'jammy';
    }
    const filename = `${version}/${name}-${version}-${code}-${this.ghArch}.tar.xz`;
    const checksumFileUrl = `https://github.com/containerbase/${name}-prebuild/releases/download/${filename}.sha512`;
    const hasChecksum = await this.http.exists(checksumFileUrl);
    let file: string;

    if (hasChecksum) {
      // no distro specific prebuilds
      const expectedChecksum = await this.getChecksum(checksumFileUrl);
      file = await this.http.download({
        url: `https://github.com/containerbase/${name}-prebuild/releases/download/${filename}`,
        checksumType: 'sha512',
        expectedChecksum,
      });
    } else {
      file = await this.http.download({
        url: `https://github.com/containerbase/${name}-prebuild/releases/download/${filename}`,
      });
    }

    const path = await this.pathSvc.ensureToolPath(this.name);

    await this.compress.extract({ file, cwd: path });
  }

  override async link(version: string): Promise<void> {
    await this.postInstall(version);
  }

  override async postInstall(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');
    await this.shellwrapper({ srcDir: src });
  }

  override async test(_version: string): Promise<void> {
    await execa('php', ['--version'], {
      stdio: ['inherit', 'inherit', 1],
    });
  }

  private async getChecksum(checksumFileUrl: string): Promise<string> {
    const checksumFile = await this.http.download({ url: checksumFileUrl });
    const expectedChecksum = (await fs.readFile(checksumFile, 'utf-8')).trim();
    return expectedChecksum;
  }
}

@injectable()
export class PhpVersionResolver extends ToolVersionResolver {
  readonly tool = 'php';

  async resolve(version: string | undefined): Promise<string | undefined> {
    if (!isNonEmptyStringAndNotWhitespace(version) || version === 'latest') {
      return await this.http.get(
        `https://github.com/containerbase/${this.tool}-prebuild/releases/latest/download/version`,
      );
    }
    return version;
  }
}

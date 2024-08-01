import fs from 'node:fs/promises';
import path from 'node:path';
import { execa } from 'execa';
import { inject, injectable } from 'inversify';
import semver from 'semver';
import { BaseInstallService } from '../../install-tool/base-install.service';
import { BasePrepareService } from '../../prepare-tool/base-prepare.service';
import {
  CompressionService,
  EnvService,
  HttpService,
  PathService,
} from '../../services';
import { logger } from '../../utils';
import {
  createGradleSettings,
  createMavenSettings,
  resolveJavaDownloadUrl,
  resolveLatestJavaLtsVersion,
} from './utils';

@injectable()
export class JavaPrepareService extends BasePrepareService {
  readonly name: string = 'java';

  constructor(
    @inject(PathService) pathSvc: PathService,
    @inject(EnvService) envSvc: EnvService,
    @inject(HttpService) private readonly httpSvc: HttpService,
    @inject(CompressionService)
    private readonly compressionSvc: CompressionService,
  ) {
    super(pathSvc, envSvc);
  }

  override async execute(): Promise<void> {
    const ssl = this.pathSvc.sslPath;

    if (await this.isPrepared()) {
      // cert store already there
      return;
    }

    await createMavenSettings(this.pathSvc);
    await createGradleSettings(this.pathSvc);

    // compatibility with gradle and maven
    await fs.symlink(
      path.join(this.pathSvc.homePath, '.m2'),
      path.join(this.envSvc.userHome, '.m2'),
    );
    await fs.symlink(
      path.join(this.pathSvc.homePath, '.gradle'),
      path.join(this.envSvc.userHome, '.gradle'),
    );

    // fix: Failed to load native library 'libnative-platform.so' for Linux amd64.
    await this.pathSvc.exportToolEnv(
      'gradle',
      { GRADLE_USER_HOME: path.join(this.pathSvc.homePath, '.gradle') },
      true,
    );

    const version = await resolveLatestJavaLtsVersion(
      this.httpSvc,
      'jre',
      this.envSvc.arch,
    );
    if (!version) {
      throw new Error('Could not resolve latest java version');
    }

    const pkg = await resolveJavaDownloadUrl(
      this.httpSvc,
      'jre',
      this.envSvc.arch,
      version,
    );

    if (!pkg) {
      throw new Error(`Could not resolve download url for java ${version}`);
    }

    logger.debug(`downloading cacerts from ${version}`);

    const jre = await this.httpSvc.download({
      url: pkg.link,
      checksumType: 'sha256',
      expectedChecksum: pkg.checksum,
      fileName: pkg.name,
    });

    const tmp = path.join(this.pathSvc.tmpDir, 'java');

    await fs.mkdir(tmp, { recursive: true });

    await this.compressionSvc.extract({ file: jre, cwd: tmp, strip: 1 });

    await fs.cp(
      path.join(tmp, 'lib/security/cacerts'),
      path.join(ssl, 'cacerts'),
    );

    // cleanup will be done by caller
  }

  override async isPrepared(): Promise<boolean> {
    return await this.pathSvc.fileExists(
      path.join(this.pathSvc.sslPath, 'cacerts'),
    );
  }
}

@injectable()
export class JavaJdkPrepareService extends JavaPrepareService {
  override readonly name = 'java-jdk';
}

@injectable()
export class JavaJrePrepareService extends JavaPrepareService {
  override readonly name = 'java-jre';
}

@injectable()
export class JavaInstallService extends BaseInstallService {
  override name: string = 'java';

  constructor(
    @inject(EnvService) envSvc: EnvService,
    @inject(PathService) pathSvc: PathService,
    @inject(HttpService) private http: HttpService,
    @inject(CompressionService) private compress: CompressionService,
  ) {
    super(pathSvc, envSvc);
  }

  override async install(version: string): Promise<void> {
    const type = this.name === 'java-jre' ? 'jre' : 'jdk';

    const pkg = await resolveJavaDownloadUrl(
      this.http,
      type,
      this.envSvc.arch,
      version,
    );

    if (!pkg) {
      throw new Error(
        `Could not resolve download url for java ${version} and type ${type}`,
      );
    }

    const file = await this.http.download({
      url: pkg.link,
      checksumType: 'sha256',
      expectedChecksum: pkg.checksum,
      fileName: pkg.name,
    });

    await this.pathSvc.ensureToolPath(this.name);

    const cwd = await this.pathSvc.createVersionedToolPath(this.name, version);
    await this.compress.extract({
      file,
      cwd,
      strip: 1,
    });

    const v = semver.parse(version);
    // we've a different cacerts location in java 8 jdk
    const cacerts =
      v?.major === 8 && this.name !== 'java-jre'
        ? path.join(cwd, 'jre/lib/security/cacerts')
        : path.join(cwd, 'lib/security/cacerts');
    await fs.rm(cacerts);
    await fs.symlink(path.join(this.pathSvc.sslPath, 'cacerts'), cacerts);
  }

  override async isPrepared(): Promise<boolean> {
    return await this.pathSvc.fileExists(
      path.join(this.pathSvc.sslPath, 'cacerts'),
    );
  }

  override async link(version: string): Promise<void> {
    const src = path.join(
      this.pathSvc.versionedToolPath(this.name, version),
      'bin',
    );
    await this.shellwrapper({ srcDir: src, name: 'java' });
  }

  override async test(_version: string): Promise<void> {
    await execa('java', ['-version'], {
      stdio: ['inherit', 'inherit', 1],
    });
  }
}

@injectable()
export class JavaJreInstallService extends JavaInstallService {
  override readonly name = 'java-jre';
}

@injectable()
export class JavaJdkInstallService extends JavaInstallService {
  override readonly name = 'java-jdk';
}

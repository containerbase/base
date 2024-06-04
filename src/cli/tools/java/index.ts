import fs from 'node:fs/promises';
import path from 'node:path';
import { execa } from 'execa';
import { inject, injectable } from 'inversify';
import semver from 'semver';
import { InstallToolBaseService } from '../../install-tool/install-tool-base.service';
import { PrepareToolBaseService } from '../../prepare-tool/prepare-tool-base.service';
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
export class PrepareJavaService extends PrepareToolBaseService {
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

    // https://github.com/gradle/gradle/issues/8262
    await this.pathSvc.exportEnv(
      {
        GRADLE_USER_HOME: path.join(this.pathSvc.homePath, '.gradle'),
        MAVEN_USER_HOME: path.join(this.pathSvc.homePath, '.m2'),
      },
      true,
    );

    await createMavenSettings(this.pathSvc.homePath, this.envSvc.userId);
    await createGradleSettings(this.pathSvc.homePath, this.envSvc.userId);

    // compatibility with gradle and maven
    await fs.symlink(
      path.join(this.pathSvc.homePath, '.m2'),
      path.join(this.envSvc.userHome, '.m2'),
    );
    await fs.symlink(
      path.join(this.pathSvc.homePath, '.gradle'),
      path.join(this.envSvc.userHome, '.gradle'),
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
export class PrepareJavaJdkService extends PrepareJavaService {
  override readonly name = 'java-jdk';
}

@injectable()
export class PrepareJavaJreService extends PrepareJavaService {
  override readonly name = 'java-jre';
}

@injectable()
export class InstallJavaService extends InstallToolBaseService {
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

    // TODO: create recursive
    if (!(await this.pathSvc.findToolPath(this.name))) {
      await this.pathSvc.createToolPath(this.name);
    }

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
export class InstallJavaJreService extends InstallJavaService {
  override readonly name = 'java-jre';
}

@injectable()
export class InstallJavaJdkService extends InstallJavaService {
  override readonly name = 'java-jdk';
}

import fs from 'node:fs/promises';
import path from 'node:path';
import { inject, injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../../install-tool/base-install.service.ts';
import { BasePrepareService } from '../../prepare-tool/base-prepare.service.ts';
import {
  CompressionService,
  ToolFilesService,
  ToolVersionResolverService,
} from '../../services/index.ts';
import { logger, parse } from '../../utils/index.ts';
import { addBlockedCerts } from './blocked-certs.ts';
import {
  createGradleSettings,
  createMavenSettings,
  resolveJavaDownloadUrl,
} from './utils.ts';

@injectable()
@injectFromHierarchy()
export class JavaPrepareService extends BasePrepareService {
  @inject(CompressionService)
  private readonly compressionSvc!: CompressionService;
  @inject(ToolFilesService)
  private readonly toolFilesSvc!: ToolFilesService;
  @inject(ToolVersionResolverService)
  private readonly resolverSvc!: ToolVersionResolverService;

  readonly name: string = 'java';

  /**
   * Initializes the cache, links the maven, gradle and android folders to it,
   * keeping any existing link, and sets up the shared cacerts from the
   * latest lts jre, once. The version is resolved like `install-tool java-jre`
   * resolves `latest`, its file only comes from the tool-versions data.
   *
   * @throws when no jre version resolves or the data has no file of it for
   * the host
   */
  override async prepare(): Promise<void> {
    await this.initialize();

    const cacerts = path.join(this.pathSvc.sslPath, 'cacerts');

    if (await this.pathSvc.fileExists(cacerts)) {
      // cert store already there
      return;
    }

    // compatibility with gradle and maven
    await this.pathSvc.createSymlink(
      path.join(this.pathSvc.cachePath, '.m2'),
      path.join(this.envSvc.userHome, '.m2'),
    );
    await this.pathSvc.createSymlink(
      path.join(this.pathSvc.cachePath, '.gradle'),
      path.join(this.envSvc.userHome, '.gradle'),
    );
    await this.pathSvc.createSymlink(
      path.join(this.pathSvc.cachePath, '.android'),
      path.join(this.envSvc.userHome, '.android'),
    );
    await this.pathSvc.createSymlink(
      path.join(this.pathSvc.cachePath, '.android-sdk'),
      path.join(this.envSvc.userHome, '.android-sdk'),
    );

    // resolved from the tool-versions data first, the embedded data always has
    // a jre, a slightly older cacerts is fine
    const version = await this.resolverSvc.resolve('java-jre', undefined);
    if (!version) {
      throw new Error('Could not resolve the latest java-jre version');
    }

    logger.debug(`downloading cacerts from ${version}`);

    const jre = await this.toolFilesSvc.downloadToolFile('java-jre', version);
    if (!jre) {
      throw new Error(
        `Could not find a java-jre ${version} file in the tool-versions data`,
      );
    }

    const tmp = path.join(this.envSvc.tmpDir, 'java');

    await fs.mkdir(tmp, { recursive: true });

    await this.compressionSvc.extract({ file: jre, cwd: tmp, strip: 1 });

    const varCerts = path.join(this.pathSvc.varPath, 'cacerts');

    await fs.cp(path.join(tmp, 'lib/security/cacerts'), varCerts);

    await fs.symlink(varCerts, cacerts);

    await this.pathSvc.exportEnv({ ANDROID_HOME: '~/.android-sdk' });

    // cleanup will be done by caller
  }

  /**
   * Creates the maven and gradle settings and the android folders in the
   * containerbase cache, and points `GRADLE_USER_HOME` there.
   */
  override async initialize(): Promise<void> {
    await createMavenSettings(this.pathSvc);
    await createGradleSettings(this.pathSvc);

    await this.pathSvc.createDir(`${this.pathSvc.cachePath}/.android`);
    await this.pathSvc.createDir(`${this.pathSvc.cachePath}/.android-sdk`);

    if (!(await this.pathSvc.toolEnvExists('gradle'))) {
      // fix: Failed to load native library 'libnative-platform.so' for Linux amd64.
      await this.pathSvc.exportToolEnv(
        'gradle',
        { GRADLE_USER_HOME: path.join(this.pathSvc.cachePath, '.gradle') },
        true,
      );
    }
  }
}

@injectable()
@injectFromHierarchy()
export class JavaJdkPrepareService extends JavaPrepareService {
  override readonly name = 'java-jdk';
}

@injectable()
@injectFromHierarchy()
export class JavaJrePrepareService extends JavaPrepareService {
  override readonly name = 'java-jre';
}

@injectable()
@injectFromHierarchy()
export class JavaInstallService extends BaseInstallService {
  override name = 'java';

  /** The oldest Temurin release adoptium serves. */
  override readonly minVersion = '8.0.302+8';

  /**
   * The maven repository, the gradle caches and the distributions the maven
   * and gradle wrappers downloaded.
   */
  override readonly cacheDirs = [
    '.gradle/caches',
    '.gradle/wrapper/dists',
    '.m2/repository',
    '.m2/wrapper/dists',
  ];

  /**
   * Downloads the Temurin jdk or jre from the tool-versions data, or the one
   * the adoptium API lists, verified against its checksum, into the versioned
   * tool path, adds the revoked intermediate CAs to its blocked list and
   * replaces its cacerts with the shared ones. The data of `java` lists the
   * jdk, like `java-jdk`.
   *
   * @throws when neither has a package for the version
   */
  override async install(version: string): Promise<void> {
    // TODO: drop the adoptium fallback in the next major (#7962)
    const file =
      (await this.downloadToolFile(version)) ??
      (await this.downloadAdoptium(version));

    await this.pathSvc.ensureToolPath(this.name);

    const cwd = await this.pathSvc.createVersionedToolPath(this.name, version);
    await this.compress.extract({
      file,
      cwd,
      strip: 1,
    });

    const v = parse(version);
    // we've a different cacerts location in java 8 jdk
    const cacerts =
      v.major === 8 && this.name !== 'java-jre'
        ? path.join(cwd, 'jre/lib/security/cacerts')
        : path.join(cwd, 'lib/security/cacerts');
    await addBlockedCerts(path.dirname(cacerts), v.major);
    await fs.rm(cacerts);
    await fs.symlink(path.join(this.pathSvc.sslPath, 'cacerts'), cacerts);
  }

  /**
   * Downloads the jdk or jre the adoptium API lists for the version, verified
   * against its checksum.
   *
   * @throws when adoptium has no package for the version
   */
  private async downloadAdoptium(version: string): Promise<string> {
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

    return await this.http.download({
      url: pkg.link,
      checksumType: 'sha256',
      expectedChecksum: pkg.checksum,
      fileName: pkg.name,
    });
  }

  /** Whether the shared cacerts exist, which prepare creates. */
  override async isPrepared(): Promise<boolean> {
    return await this.pathSvc.fileExists(
      path.join(this.pathSvc.sslPath, 'cacerts'),
    );
  }

  /** Links the `java` binary into the global bin folder. */
  override async link(version: string): Promise<void> {
    const src = path.join(
      this.pathSvc.versionedToolPath(this.name, version),
      'bin',
    );
    await this.shellwrapper({ srcDir: src, name: 'java' });
  }

  /** Checks that `java -version` runs. */
  override async test(_version: string): Promise<void> {
    await this._spawn('java', ['-version']);
  }
}

@injectable()
@injectFromHierarchy()
export class JavaJreInstallService extends JavaInstallService {
  override readonly name = 'java-jre';

  /** Other tools depend on it as `java`. */
  override get alias(): string {
    return 'java';
  }
}

@injectable()
@injectFromHierarchy()
export class JavaJdkInstallService extends JavaInstallService {
  override readonly name = 'java-jdk';

  /** Other tools depend on it as `java`. */
  override get alias(): string {
    return 'java';
  }
}

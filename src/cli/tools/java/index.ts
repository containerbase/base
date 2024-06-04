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
import type { JavaReleases } from './schema';

const baseUrl =
  'https://github.com/joschi/java-metadata/raw/main/docs/metadata/ga/linux';
const fileUrl = 'hotspot/temurin.json';

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

    const url = `${baseUrl}/${this.envSvc.arch === 'amd64' ? 'x86_64' : 'aarch64'}/jre/${fileUrl}`;

    const releases = await this.httpSvc.getJson<JavaReleases>(url);

    // sadly no lts info in metadata, so using latest version
    // also ignore alpine builds
    const latest = releases
      .filter((c) => !c.filename.includes('_alpine-linux_'))
      .reduce((prev, curr) =>
        prev && semver.compare(prev.version, curr.version) > 0 ? prev : curr,
      );

    logger.debug(`downloading cacerts from ${latest.version}`);

    const jre = await this.httpSvc.download({
      url: latest.url,
      checksumType: 'sha512',
      expectedChecksum: latest.sha512,
      fileName: latest.filename,
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
    const arch = this.envSvc.arch === 'amd64' ? 'x86_64' : 'aarch64';
    const type = this.name === 'java-jre' ? 'jre' : 'jdk';
    const url = `${baseUrl}/${arch}/${type}/${fileUrl}`;

    const releases = await this.http.getJson<JavaReleases>(url);

    // Ignore alpine builds
    const release = releases
      .filter((c) => !c.filename.includes('_alpine-linux_'))
      .find((r) => r.version === version);

    if (!release) {
      throw new Error(`Version ${version} not found`);
    }

    const file = await this.http.download({
      url: release.url,
      checksumType: 'sha512',
      expectedChecksum: release.sha512,
      fileName: release.filename,
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

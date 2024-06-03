import fs from 'node:fs/promises';
import { join } from 'node:path';
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

// Dart SDK sample urls
// https://storage.googleapis.com/dart-archive/channels/stable/release/1.11.0/sdk/dartsdk-linux-x64-release.zip
// https://storage.googleapis.com/dart-archive/channels/stable/release/2.18.0/sdk/dartsdk-linux-x64-release.zip
// https://storage.googleapis.com/dart-archive/channels/stable/release/2.19.4/sdk/dartsdk-linux-x64-release.zip.sha256sum
// https://storage.googleapis.com/dart-archive/channels/stable/release/2.19.4/sdk/dartsdk-linux-arm64-release.zip
// https://storage.googleapis.com/dart-archive/channels/stable/release/2.19.4/sdk/dartsdk-linux-arm64-release.zip.sha256sum

@injectable()
export class PrepareDartService extends PrepareToolBaseService {
  readonly name = 'dart';

  async execute(): Promise<void> {
    await fs.mkdir(`${this.envSvc.home}/.dart`);
    await fs.writeFile(
      `${this.envSvc.home}/.dart/dartdev.json`,
      '{ "firstRun": false, "enabled": false }',
    );
    await fs.mkdir(`${this.envSvc.userHome}/.dart`);
    await fs.writeFile(
      `${this.envSvc.userHome}/.dart/dartdev.json`,
      '{ "firstRun": false, "enabled": false }',
    );

    // fs isn't recursive, so we use system binaries
    await execa('chown', [
      '-R',
      this.envSvc.userName,
      `${this.envSvc.userHome}/.dart`,
    ]);
    await execa('chmod', ['-R', 'g+w', `${this.envSvc.userHome}/.dart`]);

    await this.pathSvc.exportEnv(
      { PUB_CACHE: `${this.pathSvc.cachePath}/.pub-cache` },
      true,
    );
  }
}

@injectable()
export class InstallDartService extends InstallToolBaseService {
  readonly name = 'dart';

  private get arch(): string {
    switch (this.envSvc.arch) {
      case 'arm64':
        return 'arm64';
      case 'amd64':
        return 'x64';
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
    const ver = semver.parse(version);
    if (!ver) {
      throw new Error(`Invalid version: ${version}`);
    }
    if (ver.major < 2) {
      throw new Error(`Dart SDK version < v2 is not supported: ${version}`);
    }
    const channel = 'stable';
    const sdkUrl = `https://storage.googleapis.com/dart-archive/channels/${channel}/release/${version}/sdk`;
    const sdkFile = `dartsdk-linux-${this.arch}-release.zip`;
    const url = `${sdkUrl}/${sdkFile}`;

    const checksumFile = await this.http.download({ url: `${url}.sha256sum` });
    const expectedChecksum = (await fs.readFile(checksumFile, 'utf-8'))
      .split('\n')
      .find((l) => l.includes(sdkFile))
      ?.split(' ')[0];

    const file = await this.http.download({
      url,
      expectedChecksum,
      checksumType: 'sha256',
    });

    const path = await this.pathSvc.createVersionedToolPath(this.name, version);
    await this.compress.extract({ file, cwd: path, strip: 1 });
  }

  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');

    await this.shellwrapper({ srcDir: src });
  }

  override async test(_version: string): Promise<void> {
    await execa('dart', ['--version'], { stdio: ['inherit', 'inherit', 1] });
  }
}

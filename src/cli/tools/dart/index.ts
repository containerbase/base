import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../../install-tool/base-install.service.ts';
import { BasePrepareService } from '../../prepare-tool/base-prepare.service.ts';
import { parse } from '../../utils/index.ts';
import {
  initDartHome,
  initPubCache,
  prepareDartHome,
  preparePubCache,
  pubCacheDirs,
} from './utils.ts';

// Dart SDK sample urls
// https://storage.googleapis.com/dart-archive/channels/stable/release/1.11.0/sdk/dartsdk-linux-x64-release.zip
// https://storage.googleapis.com/dart-archive/channels/stable/release/2.18.0/sdk/dartsdk-linux-x64-release.zip
// https://storage.googleapis.com/dart-archive/channels/stable/release/2.19.4/sdk/dartsdk-linux-x64-release.zip.sha256sum
// https://storage.googleapis.com/dart-archive/channels/stable/release/2.19.4/sdk/dartsdk-linux-arm64-release.zip
// https://storage.googleapis.com/dart-archive/channels/stable/release/2.19.4/sdk/dartsdk-linux-arm64-release.zip.sha256sum

@injectable()
@injectFromHierarchy()
export class DartPrepareService extends BasePrepareService {
  readonly name = 'dart';

  /** Initializes the cache and links the dart and pub cache folders. */
  override async prepare(): Promise<void> {
    await this.initialize();
    await prepareDartHome(this.envSvc, this.pathSvc);
    await preparePubCache(this.envSvc, this.pathSvc);
  }

  /** Creates the dart and pub cache folders in the containerbase cache. */
  override async initialize(): Promise<void> {
    await initDartHome(this.pathSvc);
    await initPubCache(this.pathSvc);
  }
}

@injectable()
@injectFromHierarchy()
export class DartInstallService extends BaseInstallService {
  readonly name = 'dart';

  /** The install rejects older majors, 2.0.0 is container tested. */
  override readonly minVersion = '2.0.0';

  /**
   * The packages pub downloaded, globally activated packages in the pub cache
   * are kept.
   */
  override readonly cacheDirs = pubCacheDirs;

  /** The architecture name used by the dart sdk archives. */
  private get arch(): string {
    switch (this.envSvc.arch) {
      case 'arm64':
        return 'arm64';
      case 'amd64':
        return 'x64';
    }
  }

  /**
   * Downloads the stable dart sdk zip and extracts it into the versioned tool
   * path. The file and its checksum come from the tool-versions data, without
   * data it is verified against its `.sha256sum`.
   *
   * @throws for versions below 2
   */
  override async install(version: string): Promise<void> {
    const ver = parse(version);

    if (ver.major < 2) {
      throw new Error(`Dart SDK version < v2 is not supported: ${version}`);
    }
    const channel = 'stable';
    const sdkUrl = `https://storage.googleapis.com/dart-archive/channels/${channel}/release/${version}/sdk`;
    const sdkFile = `dartsdk-linux-${this.arch}-release.zip`;
    const url = `${sdkUrl}/${sdkFile}`;

    const file = await this.downloadChecksumSidecar(version, url, '.sha256sum');

    const path = await this.pathSvc.createVersionedToolPath(this.name, version);
    await this.compress.extract({ file, cwd: path, strip: 1 });
  }

  /** Links the `dart` binary into the global bin folder. */
  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');

    await this.shellwrapper({ srcDir: src });
  }

  /** Checks that `dart --version` runs. */
  override async test(_version: string): Promise<void> {
    await this._spawn('dart', ['--version']);
  }
}

import fs from 'node:fs/promises';
import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service.ts';
import { BasePrepareService } from '../prepare-tool/base-prepare.service.ts';
import {
  initDartHome,
  initPubCache,
  prepareDartHome,
  preparePubCache,
} from './dart/utils.ts';

@injectable()
@injectFromHierarchy()
export class FlutterPrepareService extends BasePrepareService {
  readonly name = 'flutter';

  /**
   * Initializes the cache, links the dart and pub cache folders, keeping any
   * existing link, and turns off analytics and the welcome message for root
   * and the user.
   */
  override async prepare(): Promise<void> {
    await this.initialize();
    await prepareDartHome(this.envSvc, this.pathSvc);
    await preparePubCache(this.envSvc, this.pathSvc);

    // for root
    await fs.writeFile(
      join(this.envSvc.rootDir, 'root', '.flutter'),
      '{ "firstRun": false, "enabled": false }',
    );

    // for user
    await this.pathSvc.createSymlink(
      join(this.pathSvc.cachePath, '.flutter'),
      join(this.envSvc.userHome, '.flutter'),
    );

    await this.pathSvc.createSymlink(
      join(this.pathSvc.cachePath, '.flutter_tool_state'),
      join(this.envSvc.userHome, '.flutter_tool_state'),
    );
  }

  /**
   * Creates the dart and pub cache folders and the flutter settings in the
   * containerbase cache.
   */
  override async initialize(): Promise<void> {
    await initDartHome(this.pathSvc);
    await initPubCache(this.pathSvc);

    // for user
    await this.pathSvc.writeFile(
      join(this.pathSvc.cachePath, '.flutter'),
      '{ "firstRun": false, "enabled": false }\n',
    );

    await this.pathSvc.writeFile(
      join(this.pathSvc.cachePath, '.flutter_tool_state'),
      '{ "is-bot": false, "redisplay-welcome-message": false }\n',
    );
  }
}

@injectable()
@injectFromHierarchy()
export class FlutterInstallService extends BaseInstallService {
  readonly name = 'flutter';

  /** The architecture name used by the flutter prebuilds. */
  private get ghArch(): string {
    switch (this.envSvc.arch) {
      case 'arm64':
        return 'aarch64';
      case 'amd64':
        return 'x86_64';
    }
  }

  /**
   * Downloads the containerbase flutter prebuild, verified against its
   * `.sha512`, and extracts it into the tool path.
   */
  override async install(version: string): Promise<void> {
    const name = this.name;
    const filename = `${name}-${version}-${this.ghArch}.tar.xz`;
    const url = `https://github.com/containerbase/${name}-prebuild/releases/download/${version}/${filename}`;

    const expectedChecksum = await this.getChecksum(`${url}.sha512`);
    const file = await this.http.download({
      url,
      checksumType: 'sha512',
      expectedChecksum,
    });
    await this.compress.extract({ file, cwd: await this.getToolPath() });
  }

  /**
   * Links the `flutter` binary into the global bin folder, without its
   * version check.
   */
  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');
    await this.shellwrapper({ srcDir: src, args: '--no-version-check' });
  }

  /** Checks that `flutter --version` runs. */
  override async test(_version: string): Promise<void> {
    await this._spawn('flutter', ['--version']);
  }

  /** Returns the tool path, creating it when missing. */
  private async getToolPath(): Promise<string> {
    return await this.pathSvc.ensureToolPath(this.name);
  }
}

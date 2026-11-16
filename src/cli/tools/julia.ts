import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service.ts';
import { BasePrepareService } from '../prepare-tool/base-prepare.service.ts';

@injectable()
@injectFromHierarchy()
export class JuliaPrepareService extends BasePrepareService {
  override readonly name = 'julia';

  /** Initializes the cache and links `~/.julia` to it, keeping an existing one. */
  override async prepare(): Promise<void> {
    await this.initialize();

    await this.pathSvc.createSymlink(
      join(this.pathSvc.cachePath, '.julia'),
      join(this.envSvc.userHome, '.julia'),
    );
  }

  /** Creates the `.julia` folder, the default Pkg depot, in the containerbase cache. */
  override async initialize(): Promise<void> {
    await this.pathSvc.createDir(join(this.pathSvc.cachePath, '.julia'));
  }
}

@injectable()
@injectFromHierarchy()
export class JuliaInstallService extends BaseInstallService {
  override readonly name = 'julia';
  /** 1.6, the long-term support release before 1.10, is the oldest one tested. */
  override readonly minVersion = '1.6.0';

  /** The artifacts, packages, precompiled packages and registries Pkg downloaded or built. */
  override readonly cacheDirs = [
    '.julia/artifacts',
    '.julia/compiled',
    '.julia/packages',
    '.julia/registries',
  ];

  /**
   * Downloads the julia archive from the tool-versions data, verified against
   * its checksum, and extracts it into the versioned tool path.
   * @throws when the data has no file for the version on this host
   */
  override async install(version: string): Promise<void> {
    const file = await this.downloadToolFile(version);
    if (!file) {
      throw new Error(
        `There is no tool-versions file for julia ${version} on this host`,
      );
    }

    await this.pathSvc.ensureToolPath(this.name);

    const path = await this.pathSvc.createVersionedToolPath(this.name, version);
    await this.compress.extract({ file, cwd: path, strip: 1 });
  }

  /** Links the `julia` binary into the global bin folder. */
  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');
    await this.shellwrapper({ srcDir: src });
  }

  /** Checks that `julia --version` runs. */
  override async test(_version: string): Promise<void> {
    await this._spawn(this.name, ['--version']);
  }
}

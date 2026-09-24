import fs from 'node:fs/promises';
import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../../install-tool/base-install.service.ts';
import { BasePrepareService } from '../../prepare-tool/base-prepare.service.ts';

@injectable()
@injectFromHierarchy()
export class SbtPrepareService extends BasePrepareService {
  override readonly name = 'sbt';

  /** Initializes the cache and links `~/.sbt` to it. */
  override async prepare(): Promise<void> {
    await this.initialize();

    await fs.symlink(
      join(this.pathSvc.cachePath, '.sbt'),
      join(this.envSvc.userHome, '.sbt'),
    );
  }

  /** Creates the `.sbt` folder in the containerbase cache. */
  override async initialize(): Promise<void> {
    await this.pathSvc.createDir(join(this.pathSvc.cachePath, '.sbt'));
  }
}

@injectable()
@injectFromHierarchy()
export class SbtInstallService extends BaseInstallService {
  override readonly name = 'sbt';
  override readonly parent = 'java';

  /**
   * Downloads the sbt archive from GitHub, verified against its `.sha256`,
   * extracts it into the versioned tool path and drops the macOS and Windows
   * launchers.
   */
  override async install(version: string): Promise<void> {
    const url = `https://github.com/sbt/sbt/releases/download/v${version}/${this.name}-${version}.tgz`;

    const expectedChecksum = await this.getChecksum(`${url}.sha256`);

    const file = await this.http.download({
      url,
      checksumType: 'sha256',
      expectedChecksum,
    });

    await this.pathSvc.ensureToolPath(this.name);

    const path = await this.pathSvc.createVersionedToolPath(this.name, version);
    await this.compress.extract({ file, cwd: path, strip: 1 });

    const bin = join(path, 'bin');
    for (const f of await fs.readdir(bin)) {
      if (f.endsWith('-darwin') || f.endsWith('.exe') || f.endsWith('.bat')) {
        await fs.rm(join(bin, f));
      }
    }
  }

  /** Links the `sbt` launcher into the global bin folder. */
  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');

    await this.shellwrapper({ srcDir: src });
  }

  /**
   * Checks that `sbt --version` runs in an empty folder, then removes the
   * temp and home data it leaves behind.
   * @see {@link https://github.com/sbt/sbt/issues/1458}
   */
  override async test(_version: string): Promise<void> {
    const tmp = await fs.mkdtemp(join(this.envSvc.tmpDir, `${this.name}-`));
    await this._spawn(this.name, ['--version'], { cwd: tmp });

    // cleanup sbt temp data
    await fs.rm(tmp, { recursive: true, force: true });
    await fs.rm(join(this.envSvc.tmpDir, '.sbt'), {
      recursive: true,
      force: true,
    });
    const home = join(this.envSvc.home, '.sbt');
    for (const f of await fs.readdir(home).catch(() => [])) {
      await fs.rm(join(home, f), { recursive: true, force: true });
    }
  }
}

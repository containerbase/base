import fs from 'fs/promises';
import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BasePrepareService } from '../../prepare-tool/base-prepare.service.ts';
import { fileContent, logger, pathExists } from '../../utils/index.ts';
import { PrebuildInstallService } from '../utils/prebuild.ts';

@injectable()
@injectFromHierarchy()
export class MonoPrepareService extends BasePrepareService {
  readonly name = 'mono';

  /**
   * Initializes the cache, links `~/.mono` to it, keeping any existing link,
   * and sets up the mono cert store with a hook that syncs it on ca
   * certificate updates, when the hook is missing.
   */
  override async prepare(): Promise<void> {
    // TODO: install mono dependencies if needed
    const src = join(this.pathSvc.sslPath, 'mono');
    const hook = join(
      this.envSvc.rootDir,
      'etc/ca-certificates/update.d/containerbase-mono-keystore',
    );
    await this.initialize();
    const mono = join(this.envSvc.userHome, '.mono');
    await this.pathSvc.createSymlink(
      join(this.pathSvc.cachePath, '.mono'),
      mono,
    );

    // the initialize creates the cert store folder, so the hook decides
    if (!(await pathExists(hook))) {
      // inspired by debian mono packages
      const certSync = join(this.pathSvc.binDir, 'cert-sync');
      await fs.writeFile(
        hook,
        fileContent`
          #!/bin/sh

          set -e

          [ -f ${certSync} ] || exit 0

          echo "Updating Mono key store"

          # always return true, even if the tool blows up for some reason.
          # we don't want to mess with users at install-time. failure here
          # isn't really fatal anyway, just inconvenient
          ${certSync} /etc/ssl/certs/ca-certificates.crt || true

          echo "Done"
        `,
        { mode: this.envSvc.umask },
      );
    }

    const tgt = join(this.envSvc.rootDir, `usr/share/.mono`);
    if (await pathExists(tgt)) {
      logger.warn(`Removing existing mono link at ${tgt}`);
      await fs.rm(tgt);
    }
    await fs.symlink(src, tgt);
  }

  /**
   * Creates the `.mono` folder in the containerbase cache and the mono cert
   * store folder, which an empty `/opt/containerbase` misses.
   */
  override async initialize(): Promise<void> {
    const mono = join(this.pathSvc.cachePath, '.mono');
    if (!(await pathExists(mono))) {
      await this.pathSvc.createDir(mono);
    }
    await this.pathSvc.createDir(join(this.pathSvc.sslPath, 'mono'));
  }
}

@injectable()
@injectFromHierarchy()
export class MonoInstallService extends PrebuildInstallService {
  readonly name = 'mono';
  override readonly minVersion = '6.14.1';

  /**
   * Installs the mono prebuild, adds a `cert-sync` wrapper and fills the mono
   * cert store once.
   */
  override async install(version: string): Promise<void> {
    await super.install(version);
    // create cert-sync wrapper to create the mono cert store
    const path = this.pathSvc.versionedToolPath(this.name, version);
    if (!(await pathExists(join(path, 'bin/cert-sync')))) {
      await fs.writeFile(
        join(path, 'bin/cert-sync'),
        fileContent`
          #!/bin/sh
          ${path}/bin/mono ${path}/lib/mono/4.5/cert-sync.exe "$@"
        `,
        {
          mode: this.envSvc.umask,
        },
      );
    }

    if (
      !(await pathExists(join(this.pathSvc.sslPath, 'mono/new-certs/Trust')))
    ) {
      await this._spawn(`${path}/bin/cert-sync`, [
        '/etc/ssl/certs/ca-certificates.crt',
      ]);
    }
  }

  /** Links the `mono` and `cert-sync` binaries into the global bin folder. */
  override async link(version: string): Promise<void> {
    await super.link(version);
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');
    await this.shellwrapper({ srcDir: src, name: 'cert-sync' });
  }
}

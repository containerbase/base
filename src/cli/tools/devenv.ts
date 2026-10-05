import fs from 'node:fs/promises';
import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service.ts';
import { semverCoerce, semverGte } from '../utils/index.ts';
import { PrebuildVersionResolver } from './utils/prebuild.ts';

/**
 * First `devenv` release we can build a fully static musl binary from.
 * v2.3.0 added the `devenv-static-unwrapped` flake output, but its aarch64
 * link step fails on a duplicate blake3 symbol, fixed in v2.3.1.
 * @see https://github.com/cachix/devenv/pull/3159
 */
const minVersion = '2.3.1';

@injectable()
@injectFromHierarchy()
export class DevenvInstallService extends BaseInstallService {
  readonly name = 'devenv';

  private get ghArch(): string {
    switch (this.envSvc.arch) {
      case 'arm64':
        return 'aarch64';
      case 'amd64':
        return 'x86_64';
    }
  }

  override async install(version: string): Promise<void> {
    const name = this.name;
    const filename = `${name}-${version}-${this.ghArch}.tar.xz`;
    const url = `https://github.com/containerbase/${name}-prebuild/releases/download/${version}/${filename}`;

    const checksumFile = await this.http.download({ url: `${url}.sha512` });
    const expectedChecksum = (await fs.readFile(checksumFile, 'utf-8')).trim();
    const file = await this.http.download({
      url,
      checksumType: 'sha512',
      expectedChecksum,
    });

    await this.compress.extract({
      file,
      cwd: await this.pathSvc.ensureToolPath(this.name),
    });
  }

  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');
    const nixDir = join(this.pathSvc.cachePath, 'nix');

    // devenv statically links the nix libraries, so it needs the same writable
    // store as the `nix` tool. Point both at the same one, so they share it.
    await this.shellwrapper({
      srcDir: src,
      exports: [
        `NIX_STORE_DIR=${nixDir}/store`,
        `NIX_DATA_DIR=${nixDir}/data`,
        `NIX_LOG_DIR=${nixDir}/log`,
        `NIX_STATE_DIR=${nixDir}/state`,
        `NIX_CONF_DIR=${nixDir}/conf`,
      ].join(' '),
    });
  }

  override async test(_version: string): Promise<void> {
    await this._spawn(this.name, ['version']);
  }

  /**
   * `devenv` tags both two and three part versions, eg `v2.3` and `v2.2.2`, so
   * coerce before comparing against the oldest version we can build.
   */
  override validate(version: string): Promise<boolean> {
    const coerced = semverCoerce(version);
    return Promise.resolve(!!coerced && semverGte(coerced, minVersion));
  }
}

@injectable()
@injectFromHierarchy()
export class DevenvVersionResolver extends PrebuildVersionResolver {
  readonly tool = 'devenv';
}

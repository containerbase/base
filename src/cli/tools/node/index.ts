import fs from 'node:fs/promises';
import { join } from 'node:path';
import { env as penv } from 'node:process';
import { inject, injectFromHierarchy, injectable } from 'inversify';
import { BasePrepareService } from '../../prepare-tool/base-prepare.service.ts';
import { AptService } from '../../services/index.ts';
import { fileContent, parse } from '../../utils/index.ts';
import {
  NodeBaseInstallService,
  prepareNpmrc,
  prepareSymlinks,
} from './utils.ts';

@injectable()
@injectFromHierarchy()
export class NodePrepareService extends BasePrepareService {
  @inject(AptService)
  private readonly aptSvc!: AptService;

  override name = 'node';

  /**
   * Installs `libatomic1`, which the official node 26.13.0+ binaries need,
   * then initializes the cache and links the user's npm and yarn folders to it.
   */
  override async prepare(): Promise<void> {
    // https://github.com/nodejs/node/issues/60790
    await this.aptSvc.install('libatomic1');
    await this.initialize();
    await prepareSymlinks(this.envSvc, this.pathSvc);
  }

  /**
   * Creates the npm and yarn caches and `.npmrc`, and exports the node env
   * with update notices and funding messages turned off and the openssl ca
   * store used.
   */
  override async initialize(): Promise<void> {
    await this.pathSvc.ensureCacheDir('.npm');
    await this.pathSvc.ensureCacheDir('.yarn');
    await prepareNpmrc(this.pathSvc);

    if (!(await this.pathSvc.toolEnvExists(this.name))) {
      await this.pathSvc.exportToolEnv(this.name, {
        NO_UPDATE_NOTIFIER: '1',
        npm_config_update_notifier: 'false',
        npm_config_fund: 'false',
        // node v24.6.0, v22.19.0
        // NODE_USE_SYSTEM_CA: '1', // not compatible with --use-openssl-ca
      });

      // node v6.11.0
      await this.pathSvc.exportToolEnvContent(
        this.name,
        fileContent`
          export NODE_OPTIONS="\${NODE_OPTIONS} --use-openssl-ca"
        `,
      );
    }
  }
}

@injectable()
@injectFromHierarchy()
export class NodeInstallService extends NodeBaseInstallService {
  readonly name = 'node';
  override readonly minVersion = '8.7.0';

  /**
   * The npm package cache, the packages `npx` downloaded, the pnpm store,
   * `~/.local` links to the cache, and the global caches of yarn 2 to 5
   * (`berry`) and yarn 6 (`zpm`). The yarn classic cache is in `~/.cache`,
   * which is cleaned anyway.
   */
  override readonly cacheDirs = [
    '.local/share/pnpm/store',
    '.npm/_cacache',
    '.npm/_npx',
    '.yarn/berry/cache',
    '.yarn/zpm/cache',
  ];

  /** The architecture name used by the nodejs.org archives. */
  private get nodeArch(): string {
    switch (this.envSvc.arch) {
      case 'arm64':
        return 'arm64';
      case 'amd64':
        return 'x64';
    }
  }

  /** The architecture name used by the node prebuilds. */
  private get ghArch(): string {
    switch (this.envSvc.arch) {
      case 'arm64':
        return 'aarch64';
      case 'amd64':
        return 'x86_64';
    }
  }

  /**
   * Installs the containerbase node prebuild or the nodejs.org archive, each
   * verified against its checksum. Node below 15 gets the latest node-gyp.
   */
  override async install(version: string): Promise<void> {
    const file = await this.download(version);

    await this.pathSvc.ensureToolPath(this.name);

    const path = await this.pathSvc.createVersionedToolPath(this.name, version);
    await this.compress.extract({ file, cwd: path, strip: 1 });

    const ver = parse(version);
    if (ver.major < 15) {
      await this.pathSvc.withTempDir('containerbase-npm-', async (tmp) => {
        const env = this.prepareEnv(version, tmp);
        env.PATH = `${path}/bin:${penv.PATH}`;
        // update to latest node-gyp to fully support python3
        await this.updateNodeGyp(path, tmp, env, true);
      });

      await fs.rm(join(this.envSvc.home, '.npm/_logs'), {
        recursive: true,
        force: true,
      });
    }
  }

  /** The file name of the containerbase node prebuild for the host arch. */
  private prebuildName(version: string): string {
    return `${this.name}-${version}-${this.ghArch}.tar.xz`;
  }

  /** The file name of the nodejs.org archive for the host arch. */
  private archiveName(version: string): string {
    return `${this.name}-v${version}-linux-${this.nodeArch}.tar.xz`;
  }

  /**
   * Downloads the node prebuild or archive, the prebuild first:
   *
   * 1. the prebuild listed in the tool-versions data
   * 2. without a usable listed prebuild, the prebuild release when it has a
   *    `.sha512`
   * 3. the nodejs.org archive listed in the tool-versions data
   * 4. the nodejs.org archive, verified against its `SHASUMS256.txt`
   *
   * A listed prebuild with a checksum algorithm the http service can't verify
   * isn't usable. The data is cached, so the second lookup is cheap.
   */
  private async download(version: string): Promise<string> {
    const prebuildName = this.prebuildName(version);
    const archiveName = this.archiveName(version);
    const prebuild = await this.findToolFile(
      version,
      undefined,
      (f) => f.name === prebuildName,
    );
    return (
      (prebuild?.file
        ? await this.downloadListedFile(prebuild.file)
        : await this.downloadPrebuildRelease(version)) ??
      (await this.downloadToolFile(
        version,
        undefined,
        (f) => f.name === archiveName,
      )) ??
      (await this.downloadArchive(version))
    );
  }

  /**
   * Downloads the containerbase node prebuild when its release has a
   * `.sha512`, verified against it.
   * @returns `undefined` when the release has no `.sha512`
   */
  private async downloadPrebuildRelease(
    version: string,
  ): Promise<string | undefined> {
    const url = `https://github.com/containerbase/${this.name}-prebuild/releases/download/${version}/${this.prebuildName(version)}`;
    const checksumFileUrl = `${url}.sha512`;

    if (!(await this.http.exists(checksumFileUrl))) {
      return undefined;
    }
    const expectedChecksum = await this.getChecksum(checksumFileUrl);
    return await this.http.download({
      url,
      checksumType: 'sha512',
      expectedChecksum,
    });
  }

  /**
   * Downloads the nodejs.org archive, verified against its `SHASUMS256.txt`.
   */
  private async downloadArchive(version: string): Promise<string> {
    const filename = this.archiveName(version);
    const expectedChecksum = await this.findChecksum(
      `https://nodejs.org/dist/v${version}/SHASUMS256.txt`,
      filename,
    );
    return await this.http.download({
      url: `https://nodejs.org/dist/v${version}/${filename}`,
      checksumType: 'sha256',
      expectedChecksum,
    });
  }

  /** Links the binaries, see `postInstall`. */
  override async link(version: string): Promise<void> {
    await this.postInstall(version);
  }

  /**
   * Links the `node`, `npm` and `npx` binaries, and `corepack` when bundled,
   * into the global bin folder.
   */
  override async postInstall(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');

    await this.shellwrapper({ srcDir: src });
    await this.shellwrapper({ srcDir: src, name: 'npm' });
    await this.shellwrapper({ srcDir: src, name: 'npx' });

    if (await this.pathSvc.fileExists(join(src, 'corepack'))) {
      await this.shellwrapper({ srcDir: src, name: 'corepack' });
    }
  }

  /** Checks that `node`, `npm` and a bundled `corepack` run. */
  override async test(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');

    await this._spawn('node', ['--version']);
    await this._spawn('npm', ['--version']);
    if (await this.pathSvc.fileExists(join(src, 'corepack'))) {
      await this._spawn('corepack', ['--version']);
    }
  }
}

import fs from 'node:fs/promises';
import { join } from 'node:path';
import { env as penv } from 'node:process';
import { injectFromHierarchy, injectable } from 'inversify';
import { BasePrepareService } from '../../prepare-tool/base-prepare.service.ts';
import { fileContent, getDistro, parse } from '../../utils/index.ts';
import {
  NodeBaseInstallService,
  prepareNpmCache,
  prepareNpmrc,
  prepareSymlinks,
} from './utils.ts';

@injectable()
@injectFromHierarchy()
export class NodePrepareService extends BasePrepareService {
  override name = 'node';

  /** Initializes the cache and links the user's npm folders to it. */
  override async prepare(): Promise<void> {
    await this.initialize();
    await prepareSymlinks(this.envSvc, this.pathSvc);
  }

  /**
   * Creates the npm cache and `.npmrc`, and exports the node env with update
   * notices and funding messages turned off and the openssl ca store used.
   */
  override async initialize(): Promise<void> {
    await prepareNpmCache(this.pathSvc);
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
   * Installs the containerbase node prebuild, a distro specific one, or the
   * nodejs.org archive, each verified against its checksum. Node below 15
   * gets the latest node-gyp.
   */
  override async install(version: string): Promise<void> {
    const name = this.name;
    let filename = `${version}/${name}-${version}-${this.ghArch}.tar.xz`;
    let checksumFileUrl = `https://github.com/containerbase/${name}-prebuild/releases/download/${filename}.sha512`;
    let isOnGithub = await this.http.exists(checksumFileUrl);
    let file: string;

    if (isOnGithub) {
      // no distro specific prebuilds
      const expectedChecksum = await this.getChecksum(checksumFileUrl);
      file = await this.http.download({
        url: `https://github.com/containerbase/${name}-prebuild/releases/download/${filename}`,
        checksumType: 'sha512',
        expectedChecksum,
      });
    } else {
      const distro = await getDistro();
      const versionCode = distro.versionCode;
      // distro specific prebuilds
      filename = ` ${version}/${name}-${version}-${versionCode}-${this.ghArch}.tar.xz`;
      checksumFileUrl = `https://github.com/containerbase/${name}-prebuild/releases/download/${filename}.sha512`;
      isOnGithub = await this.http.exists(checksumFileUrl);
      if (isOnGithub) {
        const expectedChecksum = await this.getChecksum(checksumFileUrl);
        file = await this.http.download({
          url: `https://github.com/containerbase/${name}-prebuild/releases/download/${filename}`,
          checksumType: 'sha512',
          expectedChecksum,
        });
      } else {
        // fallback to nodejs.org
        checksumFileUrl = `https://nodejs.org/dist/v${version}/SHASUMS256.txt`;
        filename = `${name}-v${version}-linux-${this.nodeArch}.tar.xz`;
        const expectedChecksum = await this.findChecksum(
          checksumFileUrl,
          filename,
        );
        file = await this.http.download({
          url: `https://nodejs.org/dist/v${version}/${filename}`,
          checksumType: 'sha256',
          expectedChecksum,
        });
      }
    }

    await this.pathSvc.ensureToolPath(this.name);

    const path = await this.pathSvc.createVersionedToolPath(this.name, version);
    await this.compress.extract({ file, cwd: path, strip: 1 });

    const ver = parse(version);
    if (ver.major < 15) {
      const tmp = await fs.mkdtemp(
        join(this.envSvc.tmpDir, 'containerbase-npm-'),
      );
      const env = this.prepareEnv(version, tmp);
      env.PATH = `${path}/bin:${penv.PATH}`;
      // update to latest node-gyp to fully support python3
      await this.updateNodeGyp(path, tmp, env, true);
      await fs.rm(tmp, { recursive: true, force: true });

      await fs.rm(join(this.envSvc.home, '.npm/_logs'), {
        recursive: true,
        force: true,
      });
    }
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

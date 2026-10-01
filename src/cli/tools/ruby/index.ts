import { join } from 'node:path';
import { inject, injectFromHierarchy, injectable } from 'inversify';
import { BasePrepareService } from '../../prepare-tool/base-prepare.service.ts';
import { AptService } from '../../services/index.ts';
import { fileContent, getDistro } from '../../utils/index.ts';
import { PrebuildInstallService } from '../utils/prebuild.ts';

/** The ubuntu releases ruby can be installed on. */
const supportedDistros = ['jammy', 'noble', 'resolute'];

/** The user home entries redirected into the containerbase cache. */
const cacheDirs = ['.gem', '.cocoapods', 'Library'];

@injectable()
@injectFromHierarchy()
export class RubyPrepareService extends BasePrepareService {
  @inject(AptService)
  private readonly aptSvc!: AptService;

  override readonly name = 'ruby';

  /**
   * Installs the apt packages ruby needs, initializes the cache, links the
   * user's gem and cocoapods folders to it, and links `/usr/local/ruby` to the
   * tool path, a workaround for ruby's hard-coded paths.
   *
   * @throws on an unsupported distro
   */
  override async prepare(): Promise<void> {
    const { versionCode } = await getDistro();
    if (!supportedDistros.includes(versionCode)) {
      throw new Error(
        `Tool '${this.name}' not supported on: ${versionCode}! Please use ubuntu 'jammy', 'noble' or 'resolute'.`,
      );
    }

    await this.aptSvc.install('g++', 'libffi-dev', 'libyaml-0-2', 'make');

    await this.initialize();

    for (const entry of ['.gemrc', ...cacheDirs]) {
      await this.pathSvc.createSymlink(
        join(this.pathSvc.cachePath, entry),
        join(this.envSvc.userHome, entry),
      );
    }

    await this.pathSvc.createSymlink(
      this.pathSvc.toolPath(this.name),
      join(this.envSvc.rootDir, 'usr/local/ruby'),
    );
  }

  /**
   * Creates the `.gemrc` and the gem, cocoapods and `Library` folders in the
   * containerbase cache, unless the `.gemrc` already exists.
   */
  override async initialize(): Promise<void> {
    const gemrc = join(this.pathSvc.cachePath, '.gemrc');
    if (await this.pathSvc.fileExists(gemrc)) {
      return;
    }

    await this.pathSvc.writeFile(
      gemrc,
      fileContent`
        gem: --no-document
      `,
    );

    for (const dir of cacheDirs) {
      await this.pathSvc.createDir(join(this.pathSvc.cachePath, dir));
    }
  }
}

@injectable()
@injectFromHierarchy()
export class RubyInstallService extends PrebuildInstallService {
  override readonly name = 'ruby';

  /** Installs the ruby prebuild and writes its system wide `gemrc`. */
  override async install(version: string): Promise<void> {
    await super.install(version);

    const etc = await this.pathSvc.createVersionedToolPath(
      this.name,
      version,
      'etc',
    );
    await this.pathSvc.writeFile(
      join(etc, 'gemrc'),
      fileContent`
        gem: --no-document
        :benchmark: false
        :verbose: true
        :update_sources: true
        :backtrace: false
      `,
    );
  }

  /** Links the `ruby` and `gem` binaries into the global bin folder. */
  override async link(version: string): Promise<void> {
    await super.link(version);
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');
    await this.shellwrapper({ srcDir: src, name: 'gem' });
  }

  /** Checks that `ruby` and `gem` run and prints the gem environment. */
  override async test(version: string): Promise<void> {
    await super.test(version);
    await this._spawn('gem', ['--version']);
    await this._spawn('gem', ['env']);
  }
}

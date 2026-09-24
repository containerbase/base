import fs from 'node:fs/promises';
import { join } from 'node:path';
import { inject, injectFromHierarchy, injectable } from 'inversify';
import { BasePrepareService } from '../../prepare-tool/base-prepare.service.ts';
import { AptService } from '../../services/index.ts';
import { type Distro, fileContent, getDistro } from '../../utils/index.ts';
import { PipVersionResolver } from './pip.ts';
import { PipBaseInstallService } from './utils.ts';

@injectable()
@injectFromHierarchy()
export class ConanPrepareService extends BasePrepareService {
  @inject(AptService)
  private readonly aptSvc!: AptService;

  override readonly name: string = 'conan';

  /**
   * Installs the build tools conan needs, initializes the cache and links
   * `~/.conan2` to it.
   */
  override async prepare(): Promise<void> {
    await this.aptSvc.install('cmake', 'gcc', 'g++', 'make', 'perl');

    await this.initialize();

    await fs.symlink(
      join(this.pathSvc.cachePath, '.conan2'),
      join(this.envSvc.userHome, '.conan2'),
    );
  }

  /**
   * Writes the default conan profile for the architecture and the gcc of the
   * current ubuntu release to the containerbase cache.
   */
  override async initialize(): Promise<void> {
    const distro = await getDistro();
    const profile = fileContent`
    [settings]
    arch=${getArchitecture(this.envSvc.arch)}
    build_type=Release
    compiler=gcc
    compiler.cppstd=gnu17
    compiler.libcxx=libstdc++11
    compiler.version=${getCompilerVersion(distro)}
    os=Linux
    `;

    const profilesPath = join(this.pathSvc.cachePath, '.conan2', 'profiles');
    await this.pathSvc.createDir(profilesPath);
    await this.pathSvc.writeFile(join(profilesPath, 'default'), profile);
  }
}

@injectable()
@injectFromHierarchy()
export class ConanInstallService extends PipBaseInstallService {
  override readonly name: string = 'conan';
}

@injectable()
@injectFromHierarchy()
export class ConanVersionResolver extends PipVersionResolver {
  override tool = 'conan';
}

/** The conan name of the architecture. */
function getArchitecture(arch: string): string {
  switch (arch) {
    case 'arm64':
      return 'armv8';
    case 'amd64':
      return 'x86_64';
  }

  /* v8 ignore next -- the switch above is exhaustive for `Arch` */
  throw new Error(`Unsupported architecture: ${arch}`);
}

/**
 * The gcc major version shipped with the ubuntu release.
 *
 * @throws on an unsupported distro
 */
function getCompilerVersion(distro: Distro): string {
  switch (distro.versionCode) {
    case 'jammy':
      return '11';
    case 'noble':
      return '13';
    case 'resolute':
      return '15';
  }

  throw new Error(`Unsupported distro: ${distro.name}`);
}

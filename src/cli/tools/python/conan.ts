import { join } from 'node:path';
import { codeBlock } from 'common-tags';
import { inject, injectable } from 'inversify';
import { BasePrepareService } from '../../prepare-tool/base-prepare.service';
import { AptService, EnvService, PathService } from '../../services';
import { type Distro, getDistro } from '../../utils';
import { PipVersionResolver } from './pip';
import { PipBaseInstallService } from './utils';

@injectable()
export class ConanPrepareService extends BasePrepareService {
  override readonly name: string = 'conan';

  constructor(
    @inject(PathService) pathSvc: PathService,
    @inject(EnvService) envSvc: EnvService,
    @inject(AptService) private readonly aptSvc: AptService,
  ) {
    super(pathSvc, envSvc);
  }

  override async execute(): Promise<void> {
    const distro = await getDistro();
    const profile = codeBlock`
    [settings]
    arch=${getArchitecture(this.envSvc.arch)}
    build_type=Release
    compiler=gcc
    compiler.cppstd=gnu17
    compiler.libcxx=libstdc++11
    compiler.version=${getCompilerVersion(distro)}
    os=Linux
    `;

    const profilesPath = join(this.envSvc.userHome, '.conan2', 'profiles');
    await this.pathSvc.createDir(profilesPath);
    await this.pathSvc.writeFile(join(profilesPath, 'default'), profile);
    await this.aptSvc.install('cmake', 'gcc', 'g++', 'make', 'perl');
  }
}

@injectable()
export class ConanInstallService extends PipBaseInstallService {
  override readonly name: string = 'conan';
}

@injectable()
export class ConanVersionResolver extends PipVersionResolver {
  override tool: string = 'conan';
}

function getArchitecture(arch: string): string {
  switch (arch) {
    case 'arm64':
      return 'armv8';
    case 'amd64':
      return 'x86_64';
  }

  throw new Error(`Unsupported architecture: ${arch}`);
}

function getCompilerVersion(distro: Distro): string {
  switch (distro.versionCode) {
    case 'focal':
      return '9';
    case 'jammy':
      return '11';
    case 'noble':
      return '13';
  }

  throw new Error(`Unsupported distro: ${distro.name}`);
}

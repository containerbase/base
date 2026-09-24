import { execa } from 'execa';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../../install-tool/base-install.service.ts';

@injectable()
@injectFromHierarchy()
export class PaketInstallService extends BaseInstallService {
  readonly name = 'paket';
  override readonly parent = 'dotnet';

  /** Installs paket as dotnet tool into the versioned tool path. */
  override async install(version: string): Promise<void> {
    await this.pathSvc.ensureToolPath(this.name);

    const toolPath = await this.pathSvc.createVersionedToolPath(
      this.name,
      version,
    );

    await execa(
      'dotnet',
      [
        'tool',
        'install',
        '--tool-path',
        toolPath,
        this.name,
        '--version',
        version,
      ],
      { stdio: ['inherit', 'inherit', 1] },
    );
  }

  /** Links the `paket` binary into the global bin folder, with the dotnet env. */
  override async link(version: string): Promise<void> {
    const src = this.pathSvc.versionedToolPath(this.name, version);
    await this.shellwrapper({ srcDir: src, extraToolEnvs: ['dotnet'] });
  }

  /** Checks that `paket --version` runs. */
  override async test(_version: string): Promise<void> {
    await execa(this.name, ['--version'], { stdio: ['inherit', 'inherit', 1] });
  }
}

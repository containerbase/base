import { execa } from 'execa';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../../install-tool/base-install.service';

@injectable()
@injectFromHierarchy()
export class PaketInstallService extends BaseInstallService {
  readonly name = 'paket';
  override readonly parent = 'dotnet';

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

  override async link(version: string): Promise<void> {
    const src = this.pathSvc.versionedToolPath(this.name, version);
    await this.shellwrapper({ srcDir: src, extraToolEnvs: ['dotnet'] });
  }

  override async test(_version: string): Promise<void> {
    await execa(this.name, ['--version'], { stdio: ['inherit', 'inherit', 1] });
  }
}

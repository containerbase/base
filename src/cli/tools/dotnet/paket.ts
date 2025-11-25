import { join } from 'node:path';
import { execa } from 'execa';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../../install-tool/base-install.service';

@injectable()
@injectFromHierarchy()
export class PaketInstallService extends BaseInstallService {
  readonly name = 'paket';

  override async install(version: string): Promise<void> {
    const toolPath = this.pathSvc.toolPath(this.name);

    const dotnet = join(this.pathSvc.toolPath('dotnet'), 'dotnet');
    await execa(dotnet, [
      'tool',
      'install',
      '--tool-path',
      toolPath,
      this.name,
      '--version',
      version,
    ]);
  }

  override async link(_version: string): Promise<void> {
    const src = this.pathSvc.toolPath(this.name);
    await this.shellwrapper({ srcDir: src, extraToolEnvs: ['dotnet'] });
  }

  override async test(_version: string): Promise<void> {
    await execa(this.name, ['--version'], { stdio: ['inherit', 'inherit', 1] });
  }
}

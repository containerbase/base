import fs from 'node:fs/promises';
import { join } from 'node:path';
import { execa } from 'execa';
import { inject, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service';
import { BasePrepareService } from '../prepare-tool/base-prepare.service';
import {
  AptService,
  CompressionService,
  EnvService,
  HttpService,
  PathService,
} from '../services';
import { getDistro, parse, pathExists } from '../utils';

@injectable()
export class DotnetPrepareService extends BasePrepareService {
  readonly name = 'dotnet';

  constructor(
    @inject(EnvService) envSvc: EnvService,
    @inject(AptService) private readonly aptSvc: AptService,
    @inject(PathService) pathSvc: PathService,
  ) {
    super(pathSvc, envSvc);
  }

  override async prepare(): Promise<void> {
    const distro = await getDistro();

    switch (distro.versionCode) {
      case 'focal':
        await this.aptSvc.install(
          'libc6',
          'libgcc1',
          'libgssapi-krb5-2',
          'libicu66',
          'libssl1.1',
          'libstdc++6',
          'zlib1g',
        );
        break;
      case 'jammy':
        await this.aptSvc.install(
          'libc6',
          'libgcc1',
          'libgssapi-krb5-2',
          'libicu70',
          'libssl3',
          'libstdc++6',
          'zlib1g',
        );
        break;
      case 'noble':
        await this.aptSvc.install(
          'libc6',
          'libgcc1',
          'libgssapi-krb5-2',
          'libicu74',
          'libssl3',
          'libstdc++6',
          'zlib1g',
        );
        break;
    }

    await this.initialize();
    await fs.symlink(
      join(this.pathSvc.cachePath, '.nuget'),
      join(this.envSvc.userHome, '.nuget'),
    );
  }

  override async initialize(): Promise<void> {
    if (!(await this.pathSvc.toolEnvExists(this.name))) {
      await this.pathSvc.exportToolEnv(this.name, {
        DOTNET_ROOT: this.pathSvc.toolPath(this.name),
        DOTNET_CLI_TELEMETRY_OPTOUT: '1',
        DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1',
      });
    }

    const nuget = join(this.pathSvc.cachePath, '.nuget');
    if (!(await pathExists(nuget))) {
      await this.pathSvc.createDir(join(nuget, 'NuGet'));
    }
  }
}

@injectable()
export class DotnetInstallService extends BaseInstallService {
  readonly name = 'dotnet';

  private get arch(): string {
    switch (this.envSvc.arch) {
      case 'arm64':
        return 'arm64';
      case 'amd64':
        return 'x64';
    }
  }

  constructor(
    @inject(EnvService) envSvc: EnvService,
    @inject(PathService) pathSvc: PathService,
    @inject(HttpService) private http: HttpService,
    @inject(CompressionService) private compress: CompressionService,
  ) {
    super(pathSvc, envSvc);
  }

  override isInstalled(version: string): Promise<boolean> {
    const toolPath = this.pathSvc.toolPath(this.name);
    return this.pathSvc.fileExists(join(toolPath, 'sdk', version, '.version'));
  }

  override async install(version: string): Promise<void> {
    const toolPath = this.pathSvc.toolPath(this.name);

    //  https://dotnetcli.azureedge.net/dotnet/Sdk/6.0.413/dotnet-sdk-6.0.413-linux-x64.tar.gz
    const url = `https://dotnetcli.azureedge.net/dotnet/Sdk/${version}/dotnet-sdk-${version}-linux-${this.arch}.tar.gz`;
    const file = await this.http.download({ url });

    await this.compress.extract({
      file,
      cwd: toolPath,
      strip: 1,
    });

    const dotnet = join(toolPath, 'dotnet');
    await execa(dotnet, ['new']);
    if (this.envSvc.isRoot) {
      await execa('su', [this.envSvc.userName, '-c', `${dotnet} new`]);
    }

    const ver = parse(version);
    // command available since net core 3.1
    // https://docs.microsoft.com/en-us/dotnet/core/tools/dotnet-nuget-list-source
    if (ver.major > 3 || (ver.major === 3 && ver.minor >= 1)) {
      // See https://github.com/NuGet/Home/issues/11607
      await execa(dotnet, ['nuget', 'list', 'source']);
      if (this.envSvc.isRoot) {
        await execa('su', [
          this.envSvc.userName,
          '-c',
          `${dotnet} nuget list source`,
        ]);
      }
    }
    const nuget = join(this.envSvc.userHome, '.nuget', 'NuGet', 'NuGet.Config');
    if (await this.pathSvc.fileExists(nuget)) {
      await this.pathSvc.setOwner({
        path: join(this.envSvc.userHome, '.nuget'),
      });
      await this.pathSvc.setOwner({
        path: join(this.envSvc.userHome, '.nuget', 'NuGet'),
      });
      await this.pathSvc.setOwner({
        path: nuget,
      });
    }
  }

  override async link(_version: string): Promise<void> {
    const src = this.pathSvc.toolPath(this.name);
    await this.shellwrapper({ srcDir: src });
  }

  override async test(_version: string): Promise<void> {
    await execa('dotnet', ['--info'], { stdio: ['inherit', 'inherit', 1] });
  }
}

import { chmod, chown, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { execa } from 'execa';
import { inject, injectable } from 'inversify';
import { InstallToolBaseService } from '../../install-tool/install-tool-base.service';
import { PrepareToolBaseService } from '../../prepare-tool/prepare-tool-base.service';
import {
  AptService,
  CompressionService,
  EnvService,
  HttpService,
  PathService,
} from '../../services';
import { getDistro, parse } from '../../utils';

@injectable()
export class PrepareDotnetService extends PrepareToolBaseService {
  readonly name = 'dotnet';

  constructor(
    @inject(EnvService) private readonly envSvc: EnvService,
    @inject(AptService) private readonly aptSvc: AptService,
  ) {
    super();
  }

  async execute(): Promise<void> {
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
    }

    const nuget = join(this.envSvc.userHome, '.nuget');
    await mkdir(nuget);
    await chown(nuget, this.envSvc.userId, 0);
    await chmod(nuget, 0o775);
  }
}

@injectable()
export class InstallDotnetService extends InstallToolBaseService {
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

    // we need write access to some sub dirs for non root
    if (this.envSvc.isRoot) {
      //  find "$tool_path" -type d -exec chmod g+w {} \;
      await execa('find', [
        toolPath,
        '-type',
        'd',
        '-exec',
        'chmod',
        'g+w',
        '{}',
        ';',
      ]);
    }
  }

  override async link(version: string): Promise<void> {
    const src = this.pathSvc.toolPath(this.name);
    await this.shellwrapper({ srcDir: src });

    await execa('dotnet', ['new']);
    if (this.envSvc.isRoot) {
      await execa('su', [this.envSvc.userName, '-c', 'dotnet new']);
    }

    const ver = parse(version)!;
    // command available since net core 3.1
    // https://docs.microsoft.com/en-us/dotnet/core/tools/dotnet-nuget-list-source
    if (ver.major > 3 || (ver.major === 3 && ver.minor >= 1)) {
      // See https://github.com/NuGet/Home/issues/11607
      await execa('dotnet', ['nuget', 'list', 'source']);
      if (this.envSvc.isRoot) {
        await execa('su', [
          this.envSvc.userName,
          '-c',
          'dotnet nuget list source',
        ]);
      }
    }
    const nuget = join(
      this.envSvc.userHome,
      '.config',
      'NuGet',
      'NuGet.Config',
    );
    if (await this.pathSvc.fileExists(nuget)) {
      await this.pathSvc.setOwner({
        file: nuget,
      });
    }
  }

  override async test(_version: string): Promise<void> {
    await execa('dotnet', ['--info'], { stdio: ['inherit', 'inherit', 1] });
  }
}

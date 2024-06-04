import fs from 'node:fs/promises';
import { join } from 'node:path';
import is from '@sindresorhus/is';
import { execa } from 'execa';
import { inject, injectable } from 'inversify';
import semver from 'semver';
import { InstallToolBaseService } from '../../install-tool/install-tool-base.service';
import { ToolVersionResolver } from '../../install-tool/tool-version-resolver';
import {
  CompressionService,
  EnvService,
  HttpService,
  PathService,
} from '../../services';
import { GradleVersionData } from './schema';

@injectable()
export class InstallGradleService extends InstallToolBaseService {
  readonly name = 'gradle';

  constructor(
    @inject(EnvService) envSvc: EnvService,
    @inject(PathService) pathSvc: PathService,
    @inject(HttpService) private http: HttpService,
    @inject(CompressionService) private compress: CompressionService,
  ) {
    super(pathSvc, envSvc);
  }

  override async install(version: string): Promise<void> {
    const name = this.name;
    const filename = `${name}-${version}-bin.zip`;
    const url = `https://services.gradle.org/distributions/${filename}`;
    const checksumFileUrl = `${url}.sha256`;

    const expectedChecksum = await this.readChecksum(checksumFileUrl);
    const file = await this.http.download({
      url,
      checksumType: 'sha256',
      expectedChecksum,
    });

    let path = await this.pathSvc.findToolPath(this.name);
    if (!path) {
      path = await this.pathSvc.createToolPath(this.name);
    }

    path = await this.pathSvc.createVersionedToolPath(this.name, version);

    await this.compress.extract({ file, cwd: path, strip: 1 });
  }

  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');
    await this.shellwrapper({ srcDir: src });
  }

  override async test(_version: string): Promise<void> {
    await execa('gradle', ['--version'], {
      stdio: ['inherit', 'inherit', 1],
    });
  }

  override validate(version: string): Promise<boolean> {
    return Promise.resolve(semver.coerce(version) !== null);
  }

  private async readChecksum(url: string): Promise<string | undefined> {
    const checksumFile = await this.http.download({ url });
    return (await fs.readFile(checksumFile, 'utf-8')).split(' ')[0]?.trim();
  }
}

@injectable()
export class GradleVersionResolver extends ToolVersionResolver {
  readonly tool = 'gradle';

  async resolve(version: string | undefined): Promise<string | undefined> {
    if (!is.nonEmptyStringAndNotWhitespace(version) || version === 'latest') {
      return GradleVersionData.parse(
        await this.http.getJson('https://services.gradle.org/versions/current'),
      )?.version;
    }
    return version;
  }
}

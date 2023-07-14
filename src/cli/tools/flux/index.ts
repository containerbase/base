import fs from 'node:fs/promises';
import { join } from 'node:path';
import { execa } from 'execa';
import { inject, injectable } from 'inversify';
import { InstallToolBaseService } from '../../install-tool/install-tool-base.service';
import {
  CompressionService,
  EnvService,
  HttpService,
  PathService,
} from '../../services';

@injectable()
export class InstallFluxService extends InstallToolBaseService {
  readonly name = 'flux';

  private get arch(): string {
    return this.envSvc.arch;
  }

  constructor(
    @inject(EnvService) envSvc: EnvService,
    @inject(PathService) pathSvc: PathService,
    @inject(HttpService) private http: HttpService,
    @inject(CompressionService) private compress: CompressionService
  ) {
    super(pathSvc, envSvc);
  }

  override async install(version: string): Promise<void> {
    const baseUrl = `https://github.com/fluxcd/flux2/releases/download/v${version}/`;
    const filename = `flux_${version}_linux_${this.arch}.tar.gz`;

    const checksumFile = await this.http.download({
      url: `${baseUrl}flux_${version}_checksums.txt`,
    });
    const expectedChecksum = (await fs.readFile(checksumFile, 'utf-8'))
      .split('\n')
      .find((l) => l.includes(filename))
      ?.split(' ')[0];

    const file = await this.http.download({
      url: `${baseUrl}${filename}`,
      checksumType: 'sha256',
      expectedChecksum,
    });

    const path = join(
      await this.pathSvc.createVersionedToolPath(this.name, version),
      'bin'
    );
    await fs.mkdir(path);
    await this.compress.extract({
      file,
      cwd: path,
    });
  }

  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');

    await this.shellwrapper({ srcDir: src });
  }

  override needsPrepare(): boolean {
    return false;
  }

  override async test(_version: string): Promise<void> {
    await execa('flux', ['--version'], { stdio: 'inherit' });
  }
}
